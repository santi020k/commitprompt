#!/usr/bin/env node

import { createRequire } from 'node:module'
import process from 'node:process'

import { runCli } from '../src/cli.js'
import { setupVSCode } from '../src/vscode.js'
import { setupZed } from '../src/zed.js'

interface PackageMetadata {
  version: string
}

const HELP = `Commitprompt

A focused prompt for Conventional Commits.

Usage:
  commitprompt
  commitprompt setup zed
  commitprompt setup vscode
  commitprompt --help
  commitprompt --version

Commitprompt requires staged Git changes. It uses Conventional Commits rules
by default and honors Commitlint configuration from the current repository.

The setup commands configure an editor's native commit-message generator for
every project without replacing its Source Control UI or configured model.`

const arguments_ = process.argv.slice(2)
const [argument] = arguments_

if (argument === '--help' || argument === '-h') {
  console.log(HELP)
}
else if (argument === '--version' || argument === '-v') {
  const require = createRequire(import.meta.url)
  const metadata = require('../../package.json') as PackageMetadata

  console.log(metadata.version)
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
