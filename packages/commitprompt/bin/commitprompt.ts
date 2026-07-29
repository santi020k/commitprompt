#!/usr/bin/env node

import { createRequire } from 'node:module'
import process from 'node:process'

import { runCli } from '../src/cli.js'

interface PackageMetadata {
  version: string
}

const HELP = `Commitprompt

A focused prompt for Conventional Commits.

Usage:
  commitprompt
  commitprompt --help
  commitprompt --version

Commitprompt requires staged Git changes. It uses Conventional Commits rules
by default and honors Commitlint configuration from the current repository.`

const [argument] = process.argv.slice(2)

if (argument === '--help' || argument === '-h') {
  console.log(HELP)
}
else if (argument === '--version' || argument === '-v') {
  const require = createRequire(import.meta.url)
  const metadata = require('../../package.json') as PackageMetadata

  console.log(metadata.version)
}
else if (argument) {
  console.error(`Unknown argument: ${argument}\n\n${HELP}`)

  process.exitCode = 1
}
else {
  process.exitCode = await runCli()
}
