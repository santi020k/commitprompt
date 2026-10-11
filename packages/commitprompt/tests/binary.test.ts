import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, test } from 'vitest'

const binaryPath = resolve(
  import.meta.dirname, '../dist/bin/commitprompt.js'
)
const temporaryDirectories: string[] = []

const runBinary = (
  arguments_: string[],
  {
    cwd,
    input
  }: {
    cwd?: string
    input?: Buffer | string
  } = {}
) => spawnSync(process.execPath, [binaryPath, ...arguments_], {
  cwd,
  encoding: 'utf8',
  input
})

const COORDINATED_WRITE_TIMEOUT_MS = 5000

interface CoordinatedWriteResult {
  status: number | null
  stderr: string
  stdout: string
}

const splitInsideUnicodeCharacter = (payload: string): [Buffer, Buffer] => {
  const encoded = Buffer.from(payload, 'utf8')
  let splitIndex = -1

  for (let index = 1; index < encoded.length; index += 1) {
    const byte = encoded.at(index)

    if (byte !== undefined && (byte & 0xc0) === 0x80) {
      splitIndex = index

      break
    }
  }

  if (splitIndex === -1) {
    throw new Error('Payload does not contain a UTF-8 character to split.')
  }

  return [encoded.subarray(0, splitIndex), encoded.subarray(splitIndex)]
}

/**
 * Patches `process.stdin`'s async iterator so the child reports, over the IPC
 * channel, exactly when it is ready to read and exactly when it has pulled
 * each chunk out of the stream. The parent uses those signals to serialize
 * its writes so the two buffers are observed as two distinct stdin chunks
 * instead of risking a kernel-level coalesce into one read.
 */
const STDIN_HANDSHAKE_PRELOAD_SOURCE = `
const stdin = process.stdin;
const originalAsyncIterator = stdin[Symbol.asyncIterator].bind(stdin);

stdin[Symbol.asyncIterator] = () => {
  const iterator = originalAsyncIterator();

  if (process.send) process.send('ready');

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      const result = await iterator.next();

      if (process.send) process.send(result.done ? 'end' : 'consumed');

      return result;
    }
  };
};
`

const STDIN_HANDSHAKE_PRELOAD_URL = `data:text/javascript;base64,${
  Buffer.from(STDIN_HANDSHAKE_PRELOAD_SOURCE, 'utf8').toString('base64')
}`

const runBinaryWithCoordinatedWrites = async (
  arguments_: string[],
  [chunkA, chunkB]: readonly [Buffer, Buffer],
  { cwd }: { cwd?: string } = {}
): Promise<CoordinatedWriteResult> => {
  const child = spawn(
    process.execPath,
    ['--import', STDIN_HANDSHAKE_PRELOAD_URL, binaryPath, ...arguments_],
    { cwd, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }
  )

  if (!child.stdin || !child.stdout || !child.stderr) {
    child.kill()

    throw new Error('Expected the Commitprompt binary to expose standard streams.')
  }

  const { stdin, stdout: childStdout, stderr: childStderr } = child

  let stdout = ''
  let stderr = ''

  childStdout.setEncoding('utf8')
  childStderr.setEncoding('utf8')
  childStdout.on('data', (chunk: string) => {
    stdout += chunk
  })
  childStderr.on('data', (chunk: string) => {
    stderr += chunk
  })

  return await new Promise<CoordinatedWriteResult>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      fail(new Error('Timed out waiting for the Commitprompt binary to exit.'))
    }, COORDINATED_WRITE_TIMEOUT_MS)

    let settled = false
    let phase: 'waiting' | 'head-sent' | 'tail-sent' = 'waiting'

    const settle = (action: () => void): void => {
      if (settled) return

      settled = true
      clearTimeout(timeoutHandle)
      action()
    }

    const fail = (error: Error): void => {
      settle(() => {
        stdin.destroy()
        childStdout.destroy()
        childStderr.destroy()
        child.kill()
        reject(error)
      })
    }

    child.on('error', fail)
    stdin.on('error', fail)
    childStdout.on('error', fail)
    childStderr.on('error', fail)

    child.on('message', (message: unknown) => {
      if (settled) return

      if (message === 'ready' && phase === 'waiting') {
        phase = 'head-sent'
        stdin.write(chunkA)

        return
      }

      if (message === 'consumed' && phase === 'head-sent') {
        phase = 'tail-sent'
        stdin.end(chunkB)
      }
    })

    child.on('close', code => {
      settle(() => {
        resolve({ status: code, stderr, stdout })
      })
    })
  })
}

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

  test.each(['', ' \n\t'])('reports missing validation input without loading invalid configuration: %j', input => {
    const directory = createProject()

    writeFileSync(
      join(directory, 'commitlint.config.mjs'),
      'export default { rules: false }\n'
    )

    const result = runBinary(['validate', '--json', '--cwd', directory], {
      input
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(`${JSON.stringify({
      error: 'This command requires input from stdin or --input <path>.'
    })}\n`)
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
    'does not invoke the detected package manager', () => {
      const directory = createProject()
      const binaryDirectory = join(directory, 'bin')
      const markerPath = join(directory, 'package-manager-invoked')
      const packageManagerPath = join(binaryDirectory, 'pnpm')

      mkdirSync(binaryDirectory)
      writeFileSync(packageManagerPath, `#!/bin/sh\nprintf invoked > "${markerPath}"\n`)
      chmodSync(packageManagerPath, 0o755)

      const result = spawnSync(process.execPath, [
        binaryPath, 'setup', 'project', '--cwd', directory
      ], {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binaryDirectory}:${process.env.PATH ?? ''}`
        }
      })

      expect(result.status).toBe(0)
      expect(existsSync(markerPath)).toBe(false)
    }
  )

  test('configures Commitprompt validation through quality.yml', () => {
    const directory = createRepository()

    writeFileSync(
      join(directory, 'package.json'), `${JSON.stringify({ name: 'hook-consumer', private: true })}\n`
    )

    const setupResult = runBinary([
      'setup',
      'project',
      '--only',
      'dependency,commit-script,quality-hook',
      '--cwd',
      directory
    ])

    expect(setupResult.status).toBe(0)
    expect(readFileSync(join(directory, 'quality.yml'), 'utf8'))
      .toContain('Validate commit message with Commitprompt')
  })

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

  test('decodes a UTF-8 subject split across coordinated stdin writes', async () => {
    const payload = JSON.stringify({
      body: '',
      breaking: '',
      issues: '',
      scope: 'cli',
      subject: 'ship 🎉 café confetti 测试',
      type: 'feat'
    })
    const [chunkA, chunkB] = splitInsideUnicodeCharacter(payload)

    const result = await runBinaryWithCoordinatedWrites(
      ['format', '--json'], [chunkA, chunkB]
    )

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      message: 'feat(cli): ship 🎉 café confetti 测试'
    })
    expect(result.stderr).toBe('')
  }, COORDINATED_WRITE_TIMEOUT_MS + 1000)

  test('preserves a leading UTF-8 BOM on stdin to match --input file parsing', () => {
    const directory = createProject()
    const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf])
    const json = Buffer.from(JSON.stringify({
      body: '',
      breaking: '',
      issues: '',
      scope: 'cli',
      subject: 'exercise executable',
      type: 'test'
    }), 'utf8')
    const payload = Buffer.concat([utf8Bom, json])
    const inputPath = join(directory, 'answers.json')

    writeFileSync(inputPath, payload)

    const fileResult = runBinary(['format', '--json', '--input', inputPath])
    const stdinResult = runBinary(['format', '--json'], { input: payload })

    expect(fileResult.status).toBe(1)
    expect(JSON.parse(fileResult.stderr)).toEqual({
      error: 'Input must be a valid JSON object.'
    })
    expect(stdinResult.status).toBe(fileResult.status)
    expect(stdinResult.stderr).toBe(fileResult.stderr)
    expect(stdinResult.stdout).toBe(fileResult.stdout)
  })

  test('decodes stdin that ends mid UTF-8 character without throwing', () => {
    const truncated = Buffer.concat([
      Buffer.from('feat(cli): broken ', 'utf8'),
      Buffer.from([0xf0])
    ])

    const result = runBinary(['validate', '--json'], { input: truncated })

    expect(result.status === 0 || result.status === 1).toBe(true)
    expect(() => {
      JSON.parse(result.stdout)
    }).not.toThrow()
    expect(result.stderr).toBe('')
  })
})
