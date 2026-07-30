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

const getExistingInstructions = (source: string): unknown => {
  const settings = parseSettings(source, 'Zed', {
    allowTrailingComma: true
  })

  if (!isSettingsRecord(settings)) return undefined

  const agent = settings.agent

  if (!isSettingsRecord(agent)) return undefined

  return agent.commit_message_instructions
}

const WORKSPACE_START_MARKER = '[commitprompt:start]'
const WORKSPACE_END_MARKER = '[commitprompt:end]'

const combineInstructions = (
  existingInstructions: unknown,
  instructions: string
): string => {
  if (typeof existingInstructions !== 'string' || !existingInstructions.trim()) {
    return instructions
  }

  const start = existingInstructions.indexOf(WORKSPACE_START_MARKER)

  const end = existingInstructions.indexOf(
    WORKSPACE_END_MARKER, start + WORKSPACE_START_MARKER.length
  )

  if ((start === -1) !== (end === -1)) {
    throw new Error('Cannot update incomplete Commitprompt instructions in Zed settings.')
  }

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

  if (
    typeof existingInstructions === 'string' &&
    existingInstructions.includes(instructions)
  ) {
    return { changed: false, settingsPath }
  }

  const edits = modify(
    source, ['agent', 'commit_message_instructions'], combineInstructions(existingInstructions, instructions), {
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
