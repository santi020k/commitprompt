import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { COMMIT_MESSAGE_INSTRUCTIONS } from '../src/editor.js'
import {
  resolveVSCodeSettingsPath,
  setupVSCode
} from '../src/vscode.js'

const instructionSetting =
  'github.copilot.chat.commitMessageGeneration.instructions'
const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'commitprompt-vscode-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true }))
  )
})

describe('resolveVSCodeSettingsPath', () => {
  test('uses the standard macOS user settings directory', () => {
    expect(resolveVSCodeSettingsPath({
      homeDirectory: '/Users/author',
      platform: 'darwin'
    })).toBe(
      '/Users/author/Library/Application Support/Code/User/settings.json'
    )
  })

  test('honors XDG_CONFIG_HOME on Linux', () => {
    expect(resolveVSCodeSettingsPath({
      env: { XDG_CONFIG_HOME: '/configuration' },
      homeDirectory: '/home/author',
      platform: 'linux'
    })).toBe('/configuration/Code/User/settings.json')
  })

  test('uses the default Linux configuration directory', () => {
    expect(resolveVSCodeSettingsPath({
      env: {},
      homeDirectory: '/home/author',
      platform: 'linux'
    })).toBe('/home/author/.config/Code/User/settings.json')
  })

  test('uses APPDATA on Windows', () => {
    expect(resolveVSCodeSettingsPath({
      env: { APPDATA: String.raw`C:\Users\author\AppData\Roaming` },
      homeDirectory: String.raw`C:\Users\author`,
      platform: 'win32'
    })).toBe(
      String.raw`C:\Users\author\AppData\Roaming\Code\User\settings.json`
    )
  })

  test('falls back to the roaming AppData directory on Windows', () => {
    expect(resolveVSCodeSettingsPath({
      env: {},
      homeDirectory: String.raw`C:\Users\author`,
      platform: 'win32'
    })).toBe(
      String.raw`C:\Users\author\AppData\Roaming\Code\User\settings.json`
    )
  })
})

describe('setupVSCode', () => {
  test('creates global Copilot commit-generation instructions', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'Code', 'User', 'settings.json')

    await expect(setupVSCode({ settingsPath })).resolves.toEqual({
      changed: true,
      settingsPath
    })

    const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as
      Record<string, { text: string }[]>

    expect(settings[instructionSetting]).toEqual([
      { text: COMMIT_MESSAGE_INSTRUCTIONS }
    ])
  })

  test('preserves comments and existing Copilot instructions', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'settings.json')

    await writeFile(
      settingsPath, `{
  // Keep this editor preference.
  "editor.fontSize": 16,
  "${instructionSetting}": [
    { "text": "Mention issue references." },
    { "file": "./commit-guidance.md" }
  ]
}
`, 'utf8'
    )

    await setupVSCode({ settingsPath })

    const source = await readFile(settingsPath, 'utf8')

    expect(source).toContain('// Keep this editor preference.')
    expect(source).toContain('Mention issue references.')
    expect(source).toContain('./commit-guidance.md')
    expect(source).toContain(COMMIT_MESSAGE_INSTRUCTIONS)
  })

  test('does not duplicate an existing Commitprompt instruction', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'settings.json')

    await writeFile(
      settingsPath, JSON.stringify({
        [instructionSetting]: [
          { text: COMMIT_MESSAGE_INSTRUCTIONS }
        ]
      }), 'utf8'
    )

    await expect(setupVSCode({ settingsPath })).resolves.toEqual({
      changed: false,
      settingsPath
    })
  })

  test('refuses to replace a malformed instruction setting', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'settings.json')

    await writeFile(
      settingsPath, JSON.stringify({ [instructionSetting]: 'invalid' }), 'utf8'
    )

    await expect(setupVSCode({ settingsPath }))
      .rejects.toThrow('must be an array')
  })

  test('refuses to overwrite invalid settings', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'settings.json')

    await writeFile(settingsPath, '{ invalid', 'utf8')

    await expect(setupVSCode({ settingsPath }))
      .rejects.toThrow('Cannot update invalid VS Code settings')
    await expect(readFile(settingsPath, 'utf8')).resolves.toBe('{ invalid')
  })
})
