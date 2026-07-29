import {
  mkdir,
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
  resolveZedSettingsPath,
  setupZed,
} from '../src/zed.js'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'commitprompt-zed-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { force: true, recursive: true })
    )
  )
})

describe('resolveZedSettingsPath', () => {
  test('uses the standard macOS configuration directory', () => {
    expect(resolveZedSettingsPath({
      homeDirectory: '/Users/author',
      platform: 'darwin'
    })).toBe('/Users/author/.config/zed/settings.json')
  })

  test('honors XDG_CONFIG_HOME on Linux', () => {
    expect(resolveZedSettingsPath({
      env: { XDG_CONFIG_HOME: '/configuration' },
      homeDirectory: '/home/author',
      platform: 'linux'
    })).toBe('/configuration/zed/settings.json')
  })

  test('uses the default configuration directory on FreeBSD', () => {
    expect(resolveZedSettingsPath({
      env: {},
      homeDirectory: '/home/author',
      platform: 'freebsd'
    })).toBe('/home/author/.config/zed/settings.json')
  })

  test('uses APPDATA on Windows', () => {
    expect(resolveZedSettingsPath({
      env: { APPDATA: String.raw`C:\Users\author\AppData\Roaming` },
      homeDirectory: String.raw`C:\Users\author`,
      platform: 'win32'
    })).toBe(String.raw`C:\Users\author\AppData\Roaming\Zed\settings.json`)
  })

  test('falls back to the roaming AppData directory on Windows', () => {
    expect(resolveZedSettingsPath({
      env: {},
      homeDirectory: String.raw`C:\Users\author`,
      platform: 'win32'
    })).toBe(
      String.raw`C:\Users\author\AppData\Roaming\Zed\settings.json`
    )
  })
})

describe('setupZed', () => {
  test('creates global settings for Zed commit generation', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'zed', 'settings.json')

    await expect(setupZed({ settingsPath })).resolves.toEqual({
      changed: true,
      settingsPath
    })

    const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as {
      agent: {
        commit_message_instructions: string
      }
    }

    expect(settings.agent.commit_message_instructions)
      .toBe(COMMIT_MESSAGE_INSTRUCTIONS)
  })

  test('preserves comments and existing commit instructions', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'settings.json')

    await writeFile(
      settingsPath,
      `{
  // Keep this model preference.
  "agent": {
    "commit_message_model": {
      "provider": "zed.dev",
      "model": "claude-sonnet"
    },
    "commit_message_instructions": "Mention issue references."
  }
}
`,
      'utf8'
    )

    await setupZed({ settingsPath })

    const source = await readFile(settingsPath, 'utf8')

    expect(source).toContain('// Keep this model preference.')
    expect(source).toContain('Mention issue references.')
    expect(source).toContain(COMMIT_MESSAGE_INSTRUCTIONS)
  })

  test('does not duplicate an existing Commitprompt instruction', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'settings.json')
    const instructionKey = 'commit_message_instructions'

    await mkdir(directory, { recursive: true })
    await writeFile(
      settingsPath,
      JSON.stringify({
        agent: {
          [instructionKey]: COMMIT_MESSAGE_INSTRUCTIONS
        }
      }),
      'utf8'
    )

    await expect(setupZed({ settingsPath })).resolves.toEqual({
      changed: false,
      settingsPath
    })
  })

  test('refuses to overwrite invalid settings', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'settings.json')

    await writeFile(settingsPath, '{ invalid', 'utf8')

    await expect(setupZed({ settingsPath }))
      .rejects.toThrow('Cannot update invalid Zed settings')
    await expect(readFile(settingsPath, 'utf8')).resolves.toBe('{ invalid')
  })
})
