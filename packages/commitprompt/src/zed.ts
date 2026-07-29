import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, win32 } from 'node:path'
import process from 'node:process'

import {
  applyEdits,
  modify,
  parse,
  type ParseError,
  printParseErrorCode
} from 'jsonc-parser'

import { COMMIT_MESSAGE_INSTRUCTIONS } from './editor.js'

export const ZED_COMMIT_MESSAGE_INSTRUCTIONS = COMMIT_MESSAGE_INSTRUCTIONS

export interface ResolveZedSettingsPathOptions {
  env?: NodeJS.ProcessEnv
  homeDirectory?: string
  platform?: NodeJS.Platform
}

export interface SetupZedOptions extends ResolveZedSettingsPathOptions {
  settingsPath?: string
}

export interface SetupZedResult {
  changed: boolean
  settingsPath: string
}

export const resolveZedSettingsPath = ({
  env = process.env,
  homeDirectory = homedir(),
  platform = process.platform
}: ResolveZedSettingsPathOptions = {}): string => {
  if (platform === 'win32') {
    return win32.join(
      env.APPDATA ?? join(homeDirectory, 'AppData', 'Roaming'),
      'Zed',
      'settings.json'
    )
  }

  if (platform === 'linux' || platform === 'freebsd') {
    return join(
      env.XDG_CONFIG_HOME ?? join(homeDirectory, '.config'),
      'zed',
      'settings.json'
    )
  }

  return join(homeDirectory, '.config', 'zed', 'settings.json')
}

const readSettings = async (settingsPath: string): Promise<string> => {
  try {
    return await readFile(settingsPath, 'utf8')
  }
  catch (error) {
    if (
      error instanceof Error
      && 'code' in error
      && error.code === 'ENOENT'
    ) {
      return '{}\n'
    }

    throw error
  }
}

const getExistingInstructions = (source: string): unknown => {
  const parseErrors: ParseError[] = []

  const settings = parse(source, parseErrors) as {
    agent?: {
      commit_message_instructions?: unknown
    }
  } | undefined

  if (parseErrors.length > 0) {
    const details = parseErrors
      .map(error => printParseErrorCode(error.error))
      .join(', ')

    throw new Error(`Cannot update invalid Zed settings (${details}).`)
  }

  return settings?.agent?.commit_message_instructions
}

const combineInstructions = (existingInstructions: unknown): string =>
  typeof existingInstructions === 'string' && existingInstructions.trim()
    ? `${existingInstructions.trim()}\n\n${COMMIT_MESSAGE_INSTRUCTIONS}`
    : COMMIT_MESSAGE_INSTRUCTIONS

export const setupZed = async (
  options: SetupZedOptions = {}
): Promise<SetupZedResult> => {
  const settingsPath = options.settingsPath
    ?? resolveZedSettingsPath(options)

  const source = await readSettings(settingsPath)
  const existingInstructions = getExistingInstructions(source)

  if (
    typeof existingInstructions === 'string'
    && existingInstructions.includes(COMMIT_MESSAGE_INSTRUCTIONS)
  ) {
    return { changed: false, settingsPath }
  }

  const edits = modify(
    source,
    ['agent', 'commit_message_instructions'],
    combineInstructions(existingInstructions),
    {
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
