import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import process from 'node:process'

import {
  applyEdits,
  modify
} from 'jsonc-parser'

import { COMMIT_MESSAGE_INSTRUCTIONS } from './editor.js'
import {
  isSettingsRecord,
  parseSettings,
  readSettings,
  writeSettings
} from './settings.js'

const COMMIT_INSTRUCTIONS_SETTING =
  'github.copilot.chat.commitMessageGeneration.instructions'

interface VSCodeInstruction {
  file?: string
  text?: string
}

export interface ResolveVSCodeSettingsPathOptions {
  env?: NodeJS.ProcessEnv
  homeDirectory?: string
  platform?: NodeJS.Platform
}

export interface SetupVSCodeOptions extends ResolveVSCodeSettingsPathOptions {
  settingsPath?: string
}

export interface SetupVSCodeResult {
  changed: boolean
  settingsPath: string
}

export const resolveVSCodeSettingsPath = ({
  env = process.env,
  homeDirectory = homedir(),
  platform = process.platform
}: ResolveVSCodeSettingsPathOptions = {}): string => {
  if (platform === 'win32') {
    return win32.join(
      env.APPDATA ?? win32.join(homeDirectory, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json'
    )
  }

  if (platform === 'darwin') {
    return posix.join(
      homeDirectory, 'Library', 'Application Support', 'Code', 'User', 'settings.json'
    )
  }

  return posix.join(
    env.XDG_CONFIG_HOME ?? posix.join(homeDirectory, '.config'), 'Code', 'User', 'settings.json'
  )
}

const getExistingInstructions = (source: string): VSCodeInstruction[] => {
  const settings = parseSettings(source, 'VS Code')

  const existingInstructions = isSettingsRecord(settings) ?
    settings[COMMIT_INSTRUCTIONS_SETTING] :
    undefined

  if (existingInstructions === undefined) return []

  if (!Array.isArray(existingInstructions)) {
    throw new TypeError(
      `${COMMIT_INSTRUCTIONS_SETTING} must be an array in VS Code settings.`
    )
  }

  return existingInstructions as VSCodeInstruction[]
}

export const setupVSCode = async (
  options: SetupVSCodeOptions = {}
): Promise<SetupVSCodeResult> => {
  const settingsPath = options.settingsPath ??
    resolveVSCodeSettingsPath(options)

  const source = await readSettings(settingsPath)
  const existingInstructions = getExistingInstructions(source)

  const alreadyConfigured = existingInstructions.some(
    instruction => instruction.text === COMMIT_MESSAGE_INSTRUCTIONS
  )

  if (alreadyConfigured) return { changed: false, settingsPath }

  const edits = modify(
    source, [COMMIT_INSTRUCTIONS_SETTING], [
      ...existingInstructions,
      { text: COMMIT_MESSAGE_INSTRUCTIONS }
    ], {
      formattingOptions: {
        eol: source.includes('\r\n') ? '\r\n' : '\n',
        insertSpaces: true,
        tabSize: 2
      }
    }
  )

  await writeSettings(settingsPath, applyEdits(source, edits))

  return { changed: true, settingsPath }
}
