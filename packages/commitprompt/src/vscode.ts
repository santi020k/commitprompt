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
  check?: boolean
  instructions?: string
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

const getExistingInstructions = (
  source: string
): VSCodeInstruction[] | undefined => {
  const settings = parseSettings(source, 'VS Code', {
    allowTrailingComma: true
  })

  const existingInstructions = isSettingsRecord(settings) ?
    settings[COMMIT_INSTRUCTIONS_SETTING] :
    undefined

  if (existingInstructions === undefined) return undefined

  if (!Array.isArray(existingInstructions)) {
    throw new TypeError(
      `${COMMIT_INSTRUCTIONS_SETTING} must be an array in VS Code settings.`
    )
  }

  return existingInstructions as VSCodeInstruction[]
}

const isRepositoryInstruction = (
  instruction: VSCodeInstruction,
  instructions: string
): boolean => {
  const repositoryPrefix = 'Commitprompt repository rules:'

  return instruction.text === instructions ||
    (
      instructions.startsWith(repositoryPrefix) &&
      instruction.text?.startsWith(repositoryPrefix) === true
    )
}

const getInstructionEditPath = (
  existingInstructions: VSCodeInstruction[] | undefined,
  existingIndex: number
): (number | string)[] => {
  if (existingInstructions === undefined) {
    return [COMMIT_INSTRUCTIONS_SETTING]
  }

  return [
    COMMIT_INSTRUCTIONS_SETTING,
    existingIndex === -1 ? existingInstructions.length : existingIndex
  ]
}

const createInstructionEdits = (
  source: string,
  existingInstructions: VSCodeInstruction[] | undefined,
  instructions: string
) => {
  const existingIndex = existingInstructions?.findIndex(
    instruction => isRepositoryInstruction(instruction, instructions)
  ) ?? -1

  if (existingInstructions?.[existingIndex]?.text === instructions) {
    return undefined
  }

  const instruction = { text: instructions }

  const editPath = getInstructionEditPath(
    existingInstructions, existingIndex
  )

  const editValue = existingInstructions === undefined ?
    [instruction] :
    instruction

  return modify(source, editPath, editValue, {
    formattingOptions: {
      eol: source.includes('\r\n') ? '\r\n' : '\n',
      insertSpaces: true,
      tabSize: 2
    },
    isArrayInsertion: existingInstructions !== undefined && existingIndex === -1
  })
}

export const setupVSCode = async (
  options: SetupVSCodeOptions = {}
): Promise<SetupVSCodeResult> => {
  const settingsPath = options.settingsPath ??
    resolveVSCodeSettingsPath(options)

  const source = await readSettings(settingsPath)
  const existingInstructions = getExistingInstructions(source)
  const instructions = options.instructions ?? COMMIT_MESSAGE_INSTRUCTIONS

  const edits = createInstructionEdits(
    source, existingInstructions, instructions
  )

  if (edits === undefined) return { changed: false, settingsPath }

  if (!options.check) {
    await writeSettings(settingsPath, applyEdits(source, edits))
  }

  return { changed: true, settingsPath }
}
