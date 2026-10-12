import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { createGitClient } from '../src/git.js'

const temporaryDirectories: string[] = []

const createDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'commitprompt-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

const createRepository = (): string => {
  const directory = createDirectory()

  execFileSync('git', ['init', '--quiet', '--template='], { cwd: directory })
  const hooksPath = join(directory, '.git', 'hooks')

  mkdirSync(hooksPath)
  execFileSync('git', ['config', 'core.hooksPath', hooksPath], { cwd: directory })
  execFileSync('git', ['config', 'commit.gpgSign', 'false'], { cwd: directory })
  execFileSync('git', ['config', 'user.name', 'Commitprompt Tests'], {
    cwd: directory
  })
  execFileSync('git', ['config', 'user.email', 'tests@commitprompt.dev'], {
    cwd: directory
  })

  return directory
}

describe('createGitClient', () => {
  test('detects staged changes', () => {
    const directory = createRepository()
    const git = createGitClient(directory)

    expect(git.hasStagedChanges()).toBe(false)

    writeFileSync(join(directory, 'example.txt'), 'staged')
    execFileSync('git', ['add', 'example.txt'], { cwd: directory })

    expect(git.hasStagedChanges()).toBe(true)
  })

  test('creates a commit from standard input', () => {
    const directory = createRepository()
    const git = createGitClient(directory)

    writeFileSync(join(directory, 'example.txt'), 'committed')
    execFileSync('git', ['add', 'example.txt'], { cwd: directory })

    git.commit('feat: test commit creation')

    expect(execFileSync(
      'git', ['log', '-1', '--pretty=%s'], { cwd: directory, encoding: 'utf8' }
    ).trim()).toBe('feat: test commit creation')
  })

  test('reports commit failures', () => {
    const directory = createRepository()

    expect(() => {
      createGitClient(directory).commit('chore: empty')
    }).toThrow(
      'git commit failed'
    )
  })

  test('preserves a leading comment line in the body when commit.cleanup is strip', () => {
    const directory = createRepository()

    execFileSync('git', ['config', 'commit.cleanup', 'strip'], { cwd: directory })
    writeFileSync(join(directory, 'example.txt'), 'committed')
    execFileSync('git', ['add', 'example.txt'], { cwd: directory })

    const message = 'feat: test commit creation\n\n# documented heading\nBody text kept.\n'

    createGitClient(directory).commit(message)

    expect(execFileSync(
      'git', ['log', '-1', '--pretty=%B'], { cwd: directory, encoding: 'utf8' }
    ).trimEnd()).toBe(message.trimEnd())
  })

  test('preserves content after a scissors line when commit.cleanup is scissors', () => {
    const directory = createRepository()

    execFileSync('git', ['config', 'commit.cleanup', 'scissors'], { cwd: directory })
    writeFileSync(join(directory, 'example.txt'), 'committed')
    execFileSync('git', ['add', 'example.txt'], { cwd: directory })

    const message =
      'feat: test commit creation\n\nKept body.\n' +
      '# ------------------------ >8 ------------------------\n' +
      'Kept after scissors.\n'

    createGitClient(directory).commit(message)

    expect(execFileSync(
      'git', ['log', '-1', '--pretty=%B'], { cwd: directory, encoding: 'utf8' }
    ).trimEnd()).toBe(message.trimEnd())
  })

  test('commits an ordinary message and body unmodified without cleanup configuration', () => {
    const directory = createRepository()

    writeFileSync(join(directory, 'example.txt'), 'committed')
    execFileSync('git', ['add', 'example.txt'], { cwd: directory })

    const message = 'fix: test ordinary commit\n\nOrdinary body line.\n'

    createGitClient(directory).commit(message)

    expect(execFileSync(
      'git', ['log', '-1', '--pretty=%B'], { cwd: directory, encoding: 'utf8' }
    ).trimEnd()).toBe(message.trimEnd())
  })

  test('still runs the commit-msg hook and surfaces its rejection', () => {
    const directory = createRepository()

    writeFileSync(
      join(directory, '.git', 'hooks', 'commit-msg'),
      '#!/bin/sh\nexit 1\n'
    )
    chmodSync(join(directory, '.git', 'hooks', 'commit-msg'), 0o755)
    writeFileSync(join(directory, 'example.txt'), 'committed')
    execFileSync('git', ['add', 'example.txt'], { cwd: directory })

    expect(() => {
      createGitClient(directory).commit('feat: rejected by hook')
    }).toThrow(
      'git commit failed'
    )

    expect(() => execFileSync(
      'git', ['rev-parse', '--verify', 'HEAD'], { cwd: directory, encoding: 'utf8' }
    )).toThrow()
  })

  test('distinguishes Git failures from an empty index', () => {
    const directory = createDirectory()

    expect(() => createGitClient(directory).hasStagedChanges()).toThrow(
      'git diff --cached failed'
    )
  })
})
