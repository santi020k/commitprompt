import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { createGitClient } from '../src/git.js'

const createRepository = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'commitprompt-'))

  execFileSync('git', ['init', '--quiet'], { cwd: directory })

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

    execFileSync('git', ['config', 'user.name', 'Commitprompt Tests'], {
      cwd: directory
    })
    execFileSync('git', ['config', 'user.email', 'tests@commitprompt.dev'], {
      cwd: directory
    })
    writeFileSync(join(directory, 'example.txt'), 'committed')
    execFileSync('git', ['add', 'example.txt'], { cwd: directory })

    git.commit('feat: test commit creation')

    expect(execFileSync(
      'git',
      ['log', '-1', '--pretty=%s'],
      { cwd: directory, encoding: 'utf8' }
    ).trim()).toBe('feat: test commit creation')
  })

  test('reports commit failures', () => {
    const directory = createRepository()

    expect(() => { createGitClient(directory).commit('chore: empty'); }).toThrow(
      'git commit failed'
    )
  })

  test('distinguishes Git failures from an empty index', () => {
    const directory = mkdtempSync(join(tmpdir(), 'commitprompt-no-git-'))

    expect(() => createGitClient(directory).hasStagedChanges()).toThrow(
      'git diff --cached failed'
    )
  })
})
