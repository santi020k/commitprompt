import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { setupWorkspaceEditors } from '../src/workspace-editor.js'

const temporaryDirectories: string[] = []

const createRepository = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'commitprompt-editors-'))

  temporaryDirectories.push(directory)
  await writeFile(
    join(directory, 'commitlint.config.mjs'), `export default {
  rules: {
    'scope-enum': [2, 'always', ['cli', 'docs']],
    'type-enum': [2, 'always', ['fix', 'release']]
  }
}
`, 'utf8'
  )

  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      force: true,
      recursive: true
    }))
  )
})

describe('setupWorkspaceEditors', () => {
  test('writes repository-aware instructions and preserves user preferences', async () => {
    const directory = await createRepository()
    const vscodePath = join(directory, '.vscode', 'settings.json')
    const zedPath = join(directory, '.zed', 'settings.json')

    await expect(setupWorkspaceEditors({
      cwd: directory,
      dryRun: true
    })).resolves.toEqual(expect.objectContaining({
      changed: false,
      drift: true
    }))

    const result = await setupWorkspaceEditors({ cwd: directory })

    expect(result.changed).toBe(true)
    expect(result.instructions).toContain('fix, release')
    expect(result.instructions).toContain('cli, docs')

    const vscode = await readFile(vscodePath, 'utf8')
    const zed = await readFile(zedPath, 'utf8')

    expect(vscode).toContain('Commitprompt repository rules:')
    expect(vscode).toContain('fix, release')
    expect(zed).toContain('[commitprompt:start]')
    expect(zed).toContain('cli, docs')
    expect(vscode).not.toContain('model')
    expect(zed).not.toContain('model')

    await expect(setupWorkspaceEditors({
      check: true,
      cwd: directory
    })).resolves.toEqual(expect.objectContaining({
      changed: false,
      drift: false
    }))
  })

  test('updates generated rules without replacing custom instructions', async () => {
    const directory = await createRepository()
    const vscodePath = join(directory, '.vscode', 'settings.json')
    const zedPath = join(directory, '.zed', 'settings.json')

    await setupWorkspaceEditors({ cwd: directory })

    const vscodeBefore = await readFile(vscodePath, 'utf8')
    const vscodeWithCustom = vscodeBefore
      .replace(
        '[\n', '[\n    { "text": "Mention the ticket identifier." },\n'
      )
      .replace('fix, release', 'feat')
    const zedBefore = await readFile(zedPath, 'utf8')
    const zedWithCustom = zedBefore.replace(
      '[commitprompt:start]', 'Mention the ticket identifier.\\n\\n[commitprompt:start]'
    ).replace('fix, release', 'feat')

    await writeFile(vscodePath, vscodeWithCustom, 'utf8')
    await writeFile(zedPath, zedWithCustom, 'utf8')
    await expect(setupWorkspaceEditors({
      check: true,
      cwd: directory
    })).resolves.toEqual(expect.objectContaining({ drift: true }))

    await setupWorkspaceEditors({ cwd: directory })

    const vscodeAfter = await readFile(vscodePath, 'utf8')
    const zedAfter = await readFile(zedPath, 'utf8')

    expect(vscodeAfter).toContain('Mention the ticket identifier.')
    expect(vscodeAfter).toContain('Use one of these types: fix, release.')
    expect(vscodeAfter).not.toContain('Use one of these types: feat.')
    expect(zedAfter).toContain('Mention the ticket identifier.')
    expect(zedAfter).toContain('Use one of these scopes when')
    expect(zedAfter.match(/\[commitprompt:start\]/gu)).toHaveLength(1)
  })

  test('can configure only one workspace editor', async () => {
    const directory = await createRepository()

    const result = await setupWorkspaceEditors({
      cwd: directory,
      editors: ['vscode']
    })

    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]?.editor).toBe('vscode')
    await expect(readFile(join(directory, '.vscode', 'settings.json'), 'utf8'))
      .resolves.toContain('Commitprompt repository rules:')
    await expect(readFile(join(directory, '.zed', 'settings.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })
})
