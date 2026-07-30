import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, test } from 'vitest'

const binaryPath = resolve(
  import.meta.dirname, '../dist/bin/commitprompt.js'
)
const huskyPath = resolve(
  import.meta.dirname, '../../../node_modules/.bin/husky'
)
const temporaryDirectories: string[] = []

const runBinary = (
  arguments_: string[],
  {
    cwd,
    input
  }: {
    cwd?: string
    input?: string
  } = {}
) => spawnSync(process.execPath, [binaryPath, ...arguments_], {
  cwd,
  encoding: 'utf8',
  input
})

const createRepository = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'commitprompt-binary-'))

  temporaryDirectories.push(directory)

  for (const arguments_ of [
    ['init', '--quiet'],
    ['config', 'user.name', 'Commitprompt Tests'],
    ['config', 'user.email', 'tests@commitprompt.dev']
  ]) {
    const result = spawnSync('git', arguments_, { cwd: directory })

    if (result.status !== 0) throw new Error('Could not create test repository.')
  }

  return directory
}

const createProject = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'commitprompt-binary-project-'))

  temporaryDirectories.push(directory)
  writeFileSync(
    join(directory, 'package.json'), `${JSON.stringify({
      name: 'commitprompt-consumer',
      packageManager: 'pnpm@10.32.1',
      private: true
    }, undefined, 2)}\n`
  )

  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('commitprompt executable', () => {
  test('prints help without loading repository state', () => {
    const result = runBinary(['--help'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('A focused prompt for Conventional Commits.')
    expect(result.stderr).toBe('')
  })

  test('rejects unknown options with a machine-readable error', () => {
    const result = runBinary(['format', '--json', '--unknown'])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'Unknown option: --unknown'
    })
  })

  test('requires confirmation before reading automated commit input', () => {
    const result = runBinary(['commit', '--json'])

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'Non-interactive commits require --yes to confirm the Git operation.'
    })
  })

  test('formats structured standard input', () => {
    const result = runBinary(['format', '--json'], {
      input: JSON.stringify({
        body: '',
        breaking: '',
        issues: '',
        scope: 'cli',
        subject: 'exercise executable',
        type: 'test'
      })
    })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      message: 'test(cli): exercise executable'
    })
    expect(result.stderr).toBe('')
  })

  test('returns validation details and a failure status', () => {
    const result = runBinary(['validate', '--json'], {
      input: 'not conventional'
    })

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      valid: false
    }))
    expect(result.stderr).toBe('')
  })

  test('reports project setup drift without writing', () => {
    const directory = createProject()
    const manifestPath = join(directory, 'package.json')
    const originalManifest = readFileSync(manifestPath, 'utf8')
    const result = runBinary([
      'setup',
      'project',
      '--dry-run',
      '--json',
      '--cwd',
      directory
    ])

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      changed: false,
      drift: true,
      packageManager: 'pnpm'
    }))
    expect(readFileSync(manifestPath, 'utf8')).toBe(originalManifest)
    expect(result.stderr).toBe('')
  })

  test('uses project setup check mode as a drift gate', () => {
    const directory = createProject()
    const checkArguments = [
      'setup',
      'project',
      '--check',
      '--json',
      '--cwd',
      directory
    ]
    const driftResult = runBinary(checkArguments)

    expect(driftResult.status).toBe(1)
    expect(JSON.parse(driftResult.stdout)).toEqual(expect.objectContaining({
      drift: true
    }))

    const setupResult = runBinary([
      'setup',
      'project',
      '--skip-install',
      '--json',
      '--cwd',
      directory
    ])

    expect(setupResult.status).toBe(0)
    expect(JSON.parse(setupResult.stdout)).toEqual(expect.objectContaining({
      changed: true
    }))

    const cleanResult = runBinary(checkArguments)

    expect(cleanResult.status).toBe(0)
    expect(JSON.parse(cleanResult.stdout)).toEqual(expect.objectContaining({
      drift: false
    }))
  })

  test.runIf(process.platform !== 'win32')(
    'enforces valid and invalid messages through a real Husky hook', () => {
      const directory = createRepository()

      writeFileSync(
        join(directory, 'package.json'), `${JSON.stringify({ name: 'hook-consumer', private: true })}\n`
      )

      const setupResult = runBinary([
        'setup',
        'project',
        '--only',
        'dependency,commit-script,husky-hook',
        '--skip-install',
        '--cwd',
        directory
      ])

      expect(setupResult.status).toBe(0)

      const huskyResult = spawnSync(huskyPath, [], {
        cwd: directory,
        encoding: 'utf8'
      })

      expect(huskyResult.status).toBe(0)

      const binaryDirectory = join(directory, 'node_modules', '.bin')
      const consumerBinary = join(binaryDirectory, 'commitprompt')

      mkdirSync(binaryDirectory, { recursive: true })
      symlinkSync(binaryPath, consumerBinary)
      chmodSync(binaryPath, 0o755)

      writeFileSync(join(directory, 'valid.txt'), 'valid\n')
      expect(spawnSync('git', ['add', 'valid.txt'], { cwd: directory }).status)
        .toBe(0)
      expect(spawnSync(
        'git', ['commit', '--message', 'feat: accept valid message'], { cwd: directory, encoding: 'utf8' }
      ).status).toBe(0)

      writeFileSync(join(directory, 'invalid.txt'), 'invalid\n')
      expect(spawnSync('git', ['add', 'invalid.txt'], { cwd: directory }).status)
        .toBe(0)

      const invalidCommit = spawnSync(
        'git', ['commit', '--message', 'invalid message'], { cwd: directory, encoding: 'utf8' }
      )

      expect(invalidCommit.status).not.toBe(0)
      expect(`${invalidCommit.stdout}\n${invalidCommit.stderr}`)
        .toContain('Commit blocked')
    }, 15_000
  )

  test('creates an explicitly confirmed automated commit', () => {
    const directory = createRepository()
    const input = JSON.stringify({
      body: '',
      breaking: '',
      issues: '',
      scope: 'cli',
      subject: 'exercise executable',
      type: 'test'
    })

    writeFileSync(join(directory, 'example.txt'), 'staged\n')

    const addResult = spawnSync('git', ['add', 'example.txt'], {
      cwd: directory
    })

    expect(addResult.status).toBe(0)

    const result = runBinary([
      'commit',
      '--yes',
      '--json',
      '--cwd',
      directory
    ], {
      cwd: directory,
      input
    })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      committed: true,
      message: 'test(cli): exercise executable'
    }))
    expect(result.stderr).toBe('')

    const logResult = spawnSync(
      'git', ['log', '-1', '--pretty=%s'], { cwd: directory, encoding: 'utf8' }
    )

    expect(logResult.stdout.trim()).toBe('test(cli): exercise executable')
  }, 15_000)
})
