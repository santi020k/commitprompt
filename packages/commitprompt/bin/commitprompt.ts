#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'

import { runAutomation } from '../src/automation.js'
import { runCli } from '../src/cli.js'
import type { AutomationCommand } from '../src/types.js'
import { setupVSCode } from '../src/vscode.js'
import { setupZed } from '../src/zed.js'

interface PackageMetadata {
  version: string
}

const HELP = `Commitprompt

A focused prompt for Conventional Commits.

Usage:
  commitprompt
  commitprompt instructions [--json] [--cwd <path>]
  commitprompt scopes [--json] [--cwd <path>]
  commitprompt types [--json] [--cwd <path>]
  commitprompt format [--json] [--input <path>]
  commitprompt validate [--json] [--input <path>] [--cwd <path>]
  commitprompt commit --yes [--json] [--input <path>] [--cwd <path>]
  commitprompt setup zed
  commitprompt setup vscode
  commitprompt --help
  commitprompt --version

Commitprompt requires staged Git changes. It uses Conventional Commits rules
by default and honors Commitlint configuration from the current repository.

The format and commit commands read structured JSON from stdin by default.
Validate reads a complete commit message. Use --input <path> to read a file
instead, or --input - to explicitly select stdin.

The setup commands configure an editor's native commit-message generator for
every project without replacing its Source Control UI or configured model.`

const arguments_ = process.argv.slice(2)
const [argument] = arguments_

const automationCommands = new Set<AutomationCommand>([
  'commit',
  'format',
  'instructions',
  'scopes',
  'types',
  'validate'
])

interface AutomationArguments {
  confirm: boolean
  cwd: string
  inputPath?: string
  json: boolean
}

const parseAutomationArguments = (values: string[]): AutomationArguments => {
  const options: AutomationArguments = {
    confirm: false,
    cwd: process.cwd(),
    json: false
  }

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]

    switch (value) {
      case '--json': {
        options.json = true

        break
      }

      case '--yes': {
        options.confirm = true

        break
      }

      case '--cwd': {
        const optionValue = values[index + 1]

        if (!optionValue) throw new Error('--cwd requires a value.')

        options.cwd = optionValue

        index += 1

        break
      }

      case '--input': {
        const optionValue = values[index + 1]

        if (!optionValue) throw new Error('--input requires a value.')

        options.inputPath = optionValue

        index += 1

        break
      }

      default: {
        throw new Error(`Unknown option: ${String(value)}`)
      }
    }
  }

  return options
}

const readStandardInput = async (): Promise<string> => {
  let input = ''

  for await (const chunk of process.stdin) {
    input += String(chunk)
  }

  return input
}

const acceptsInput = (command: AutomationCommand): boolean => command === 'commit' || command === 'format' || command === 'validate'

const readAutomationInput = async (
  command: AutomationCommand,
  { inputPath }: AutomationArguments
): Promise<string | undefined> => {
  if (!acceptsInput(command)) {
    if (inputPath) {
      throw new Error(`The ${command} command does not accept --input.`)
    }

    return undefined
  }

  if (inputPath && inputPath !== '-') return await readFile(inputPath, 'utf8')

  return await readStandardInput()
}

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

const writeError = (message: string): void => {
  process.stderr.write(`${message}\n`)
}

const writeOutput = (message: string): void => {
  process.stdout.write(`${message}\n`)
}

const printCommandError = (error: unknown, json: boolean): void => {
  const message = getErrorMessage(error)

  writeError(json ? JSON.stringify({ error: message }) : message)
}

const runAutomationCommand = async (
  command: AutomationCommand,
  values: string[]
): Promise<number> => {
  let json = values.includes('--json')

  try {
    const options = parseAutomationArguments(values)

    json = options.json

    if (command === 'commit' && !options.confirm) {
      throw new Error(
        'Non-interactive commits require --yes to confirm the Git operation.'
      )
    }

    const input = await readAutomationInput(command, options)

    return await runAutomation({
      command,
      confirm: options.confirm,
      cwd: options.cwd,
      error: writeError,
      input,
      json,
      log: writeOutput
    })
  } catch (error) {
    printCommandError(error, json)

    return 1
  }
}

if (argument === '--help' || argument === '-h') {
  writeOutput(HELP)
} else if (argument === '--version' || argument === '-v') {
  const require = createRequire(import.meta.url)
  const metadata = require('../../package.json') as PackageMetadata

  writeOutput(metadata.version)
} else if (automationCommands.has(argument as AutomationCommand)) {
  process.exitCode = await runAutomationCommand(
    argument as AutomationCommand, arguments_.slice(1)
  )
} else if (argument === 'setup' && arguments_[1] === 'zed' && arguments_.length === 2) {
  try {
    const result = await setupZed()

    writeOutput(
      result.changed ?
        `Configured Zed commit generation in ${result.settingsPath}` :
        `Zed commit generation is already configured in ${result.settingsPath}`
    )
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error))

    process.exitCode = 1
  }
} else if (
  argument === 'setup' &&
  arguments_[1] === 'vscode' &&
  arguments_.length === 2
) {
  try {
    const result = await setupVSCode()

    writeOutput(
      result.changed ?
        `Configured VS Code commit generation in ${result.settingsPath}` :
        `VS Code commit generation is already configured in ${result.settingsPath}`
    )
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error))

    process.exitCode = 1
  }
} else if (argument) {
  writeError(`Unknown argument: ${arguments_.join(' ')}\n\n${HELP}`)

  process.exitCode = 1
} else {
  process.exitCode = await runCli()
}
