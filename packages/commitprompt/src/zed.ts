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

export const ZED_COMMIT_MESSAGE_INSTRUCTIONS = COMMIT_MESSAGE_INSTRUCTIONS

export interface ResolveZedSettingsPathOptions {
  env?: NodeJS.ProcessEnv
  homeDirectory?: string
  platform?: NodeJS.Platform
}

export interface SetupZedOptions extends ResolveZedSettingsPathOptions {
  check?: boolean
  instructions?: string
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
      env.APPDATA ?? win32.join(homeDirectory, 'AppData', 'Roaming'), 'Zed', 'settings.json'
    )
  }

  if (platform === 'linux' || platform === 'freebsd') {
    return posix.join(
      env.XDG_CONFIG_HOME ?? posix.join(homeDirectory, '.config'), 'zed', 'settings.json'
    )
  }

  return posix.join(homeDirectory, '.config', 'zed', 'settings.json')
}

const COMMIT_MESSAGE_INSTRUCTIONS_SETTING = 'agent.commit_message_instructions'

const getExistingInstructions = (source: string): string | undefined => {
  const settings = parseSettings(source, 'Zed', {
    allowTrailingComma: true
  })

  if (settings === undefined) return undefined

  if (!isSettingsRecord(settings)) {
    throw new TypeError('Zed settings must be a JSON object.')
  }

  const agent = settings.agent

  if (agent === undefined) return undefined

  if (!isSettingsRecord(agent)) {
    throw new TypeError('agent must be an object in Zed settings.')
  }

  const existingInstructions = agent.commit_message_instructions

  if (existingInstructions === undefined) return undefined

  if (typeof existingInstructions !== 'string') {
    throw new TypeError(
      `${COMMIT_MESSAGE_INSTRUCTIONS_SETTING} must be a string in Zed settings.`
    )
  }

  return existingInstructions
}

const WORKSPACE_START_MARKER = '[commitprompt:start]'
const WORKSPACE_END_MARKER = '[commitprompt:end]'

const hasRepeatedMarker = (
  source: string,
  marker: string
): boolean => source.indexOf(marker) !== source.lastIndexOf(marker)

const assertWellFormedMarkers = (existingInstructions: string): void => {
  const start = existingInstructions.indexOf(WORKSPACE_START_MARKER)
  const end = existingInstructions.indexOf(WORKSPACE_END_MARKER)

  if (
    (start === -1) !== (end === -1) ||
    end < start ||
    hasRepeatedMarker(existingInstructions, WORKSPACE_START_MARKER) ||
    hasRepeatedMarker(existingInstructions, WORKSPACE_END_MARKER)
  ) {
    throw new Error(
      'Cannot update an incomplete guarded section in Zed settings.'
    )
  }
}

const combineInstructions = (
  existingInstructions: string,
  instructions: string
): string => {
  if (!existingInstructions.trim()) return instructions

  const start = existingInstructions.indexOf(WORKSPACE_START_MARKER)
  const end = existingInstructions.indexOf(WORKSPACE_END_MARKER)

  if (start !== -1 && end !== -1 && instructions.includes(WORKSPACE_START_MARKER)) {
    return `${existingInstructions.slice(0, start)}${instructions}${existingInstructions.slice(
      end + WORKSPACE_END_MARKER.length
    )}`
  }

  return `${existingInstructions.trim()}\n\n${instructions}`
}

export const setupZed = async (
  options: SetupZedOptions = {}
): Promise<SetupZedResult> => {
  const settingsPath = options.settingsPath ??
    resolveZedSettingsPath(options)

  const source = await readSettings(settingsPath)
  const existingInstructions = getExistingInstructions(source)
  const instructions = options.instructions ?? COMMIT_MESSAGE_INSTRUCTIONS

  if (existingInstructions !== undefined) {
    assertWellFormedMarkers(existingInstructions)
  }

  if (existingInstructions?.includes(instructions)) {
    return { changed: false, settingsPath }
  }

  const combined = existingInstructions === undefined ?
    instructions :
    combineInstructions(existingInstructions, instructions)

  const edits = modify(
    source, ['agent', 'commit_message_instructions'], combined, {
      formattingOptions: {
        eol: source.includes('\r\n') ? '\r\n' : '\n',
        insertSpaces: true,
        tabSize: 2
      }
    }
  )

  if (!options.check) {
    await writeSettings(settingsPath, applyEdits(source, edits))
  }

  return { changed: true, settingsPath }
}
