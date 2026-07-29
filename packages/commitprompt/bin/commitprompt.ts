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
  commitprompt instructions [--json]
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
    
    break;
    }

    case '--yes': {
      options.confirm = true
    
    break;
    }

    case '--cwd':
 
    case '--input': {
      const optionValue = values[index + 1]

      if (!optionValue) throw new Error(`${value} requires a value.`)

      if (value === '--cwd') options.cwd = optionValue
      else options.inputPath = optionValue

      index += 1
    
    break;
    }

    default: {
      throw new Error(`Unknown option: ${value}`)
    }
    }
  }

  return options
}

const readStandardInput = async (): Promise<string> => {
  const chunks: Buffer[] = []

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

const runAutomationCommand = async (
  command: AutomationCommand,
  values: string[]
): Promise<number> => {
  let options: AutomationArguments

  try {
    options = parseAutomationArguments(values)
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))

    return 1
  }

  const acceptsInput = command === 'commit'
    || command === 'format'
    || command === 'validate'

  let input: string | undefined

  if (acceptsInput) {
    try {
      input = options.inputPath && options.inputPath !== '-'
        ? await readFile(options.inputPath, 'utf8')
        : await readStandardInput()
    }
    catch (error) {
      console.error(options.json
        ? JSON.stringify({
            error: error instanceof Error ? error.message : String(error)
          })
        : error instanceof Error ? error.message : String(error))

      return 1
    }
  }
  else if (options.inputPath) {
    console.error(`The ${command} command does not accept --input.`)

    return 1
  }

  return await runAutomation({
    command,
    confirm: options.confirm,
    cwd: options.cwd,
    error: message => {
      console.error(message)
    },
    input,
    json: options.json,
    log: message => {
      console.log(message)
    }
  })
}

if (argument === '--help' || argument === '-h') {
  console.log(HELP)
}
else if (argument === '--version' || argument === '-v') {
  const require = createRequire(import.meta.url)
  const metadata = require('../../package.json') as PackageMetadata

  console.log(metadata.version)
}
else if (automationCommands.has(argument as AutomationCommand)) {
  process.exitCode = await runAutomationCommand(
    argument as AutomationCommand,
    arguments_.slice(1)
  )
}
else if (argument === 'setup' && arguments_[1] === 'zed' && arguments_.length === 2) {
  try {
    const result = await setupZed()

    console.log(
      result.changed
        ? `Configured Zed commit generation in ${result.settingsPath}`
        : `Zed commit generation is already configured in ${result.settingsPath}`
    )
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))

    process.exitCode = 1
  }
}
else if (
  argument === 'setup'
  && arguments_[1] === 'vscode'
  && arguments_.length === 2
) {
  try {
    const result = await setupVSCode()

    console.log(
      result.changed
        ? `Configured VS Code commit generation in ${result.settingsPath}`
        : `VS Code commit generation is already configured in ${result.settingsPath}`
    )
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))

    process.exitCode = 1
  }
}
else if (argument) {
  console.error(`Unknown argument: ${arguments_.join(' ')}\n\n${HELP}`)

  process.exitCode = 1
}
else {
  process.exitCode = await runCli()
}
