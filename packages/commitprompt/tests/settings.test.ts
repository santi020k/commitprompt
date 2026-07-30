import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, test } from 'vitest'

import {
  parseSettings,
  readSettings,
  writeSettings
} from '../src/settings.js'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'commitprompt-settings-'))

  temporaryDirectories.push(directory)

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

describe('settings utilities', () => {
  test('supplies an empty object when a settings file does not exist', async () => {
    const directory = await createTemporaryDirectory()

    await expect(readSettings(join(directory, 'settings.json')))
      .resolves.toBe('{}\n')
  })

  test('reads and parses existing JSONC settings', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'settings.json')
    const source = '{\n  // Keep this.\n  "enabled": true,\n}\n'

    await writeFile(settingsPath, source, 'utf8')

    await expect(readSettings(settingsPath)).resolves.toBe(source)
    expect(parseSettings(source, 'Test', { allowTrailingComma: true }))
      .toEqual({ enabled: true })
  })

  test('reports invalid settings with the editor name', () => {
    expect(() => parseSettings('{ invalid', 'Example'))
      .toThrow('Cannot update invalid Example settings')
  })

  test('atomically creates and replaces a settings file', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'nested', 'settings.json')

    await writeSettings(settingsPath, 'first\n')
    await writeSettings(settingsPath, 'second\n')

    await expect(readFile(settingsPath, 'utf8')).resolves.toBe('second\n')
    await expect(readdir(join(directory, 'nested')))
      .resolves.toEqual(['settings.json'])
  })

  test.runIf(process.platform !== 'win32')(
    'preserves existing settings permissions', async () => {
      const directory = await createTemporaryDirectory()
      const settingsPath = join(directory, 'settings.json')

      await writeSettings(settingsPath, 'first\n')
      await chmod(settingsPath, 0o640)
      await writeSettings(settingsPath, 'second\n')

      expect((await stat(settingsPath)).mode & 0o777).toBe(0o640)
    }
  )

  test('cleans up the temporary file when replacement fails', async () => {
    const directory = await createTemporaryDirectory()
    const settingsPath = join(directory, 'target')

    await writeSettings(join(settingsPath, 'existing.txt'), 'keep')
    await expect(writeSettings(settingsPath, 'invalid target'))
      .rejects.toBeInstanceOf(Error)
    await expect(readdir(directory)).resolves.toEqual(['target'])
    await expect(readFile(join(settingsPath, 'existing.txt'), 'utf8'))
      .resolves.toBe('keep')
  })
})
