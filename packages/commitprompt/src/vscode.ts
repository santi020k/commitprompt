import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, posix, win32 } from 'node:path'
import process from 'node:process'

import {
  applyEdits,
  modify,
  parse,
  type ParseError,
  printParseErrorCode
} from 'jsonc-parser'

import { COMMIT_MESSAGE_INSTRUCTIONS } from './editor.js'

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

const readSettings = async (settingsPath: string): Promise<string> => {
  try {
    return await readFile(settingsPath, 'utf8')
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return '{}\n'
    }

    throw error
  }
}

const getExistingInstructions = (source: string): VSCodeInstruction[] => {
  const parseErrors: ParseError[] = []

  const settings = parse(source, parseErrors) as
    | Record<string, unknown> |
    undefined

  if (parseErrors.length > 0) {
    const details = parseErrors
      .map(error => printParseErrorCode(error.error))
      .join(', ')

    throw new Error(`Cannot update invalid VS Code settings (${details}).`)
  }

  const existingInstructions = settings?.[COMMIT_INSTRUCTIONS_SETTING]

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

  await mkdir(dirname(settingsPath), { recursive: true })

  await writeFile(settingsPath, applyEdits(source, edits), 'utf8')

  return { changed: true, settingsPath }
}
