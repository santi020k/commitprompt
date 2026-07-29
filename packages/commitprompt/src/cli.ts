import process from 'node:process'
import { createInterface } from 'node:readline/promises'

import { DEFAULT_COMMIT_TYPES } from './constants.js'
import { createGitClient } from './git.js'
import { formatCommitMessage } from './message.js'
import { collectCommitAnswers, confirmCommit } from './prompt.js'
import type { RunCommitFlowOptions } from './types.js'
import { createCommitlintValidator } from './validator.js'

export const runCommitFlow = async ({
  error,
  git,
  log,
  prompt,
  types = DEFAULT_COMMIT_TYPES,
  validator
}: RunCommitFlowOptions): Promise<number> => {
  try {
    if (!git.hasStagedChanges()) {
      error('No staged changes. Stage the files you want to commit first.')

      return 1
    }

    const answers = await collectCommitAnswers(prompt, types, log, error)
    const message = formatCommitMessage(answers)

    log(`\n${message}\n`)

    const validation = await validator.validate(message)

    for (const warning of validation.warnings) error(`warning: ${warning}`)

    if (!validation.valid) {
      for (const validationError of validation.errors) {
        error(`error: ${validationError}`)
      }

      return 1
    }

    if (!await confirmCommit(prompt, error)) {
      log('Commit cancelled.')

      return 0
    }

    git.commit(message)

    return 0
  }
  catch (caughtError) {
    const message = caughtError instanceof Error
      ? caughtError.message
      : String(caughtError)

    error(message)

    return 1
  }
  finally {
    prompt.close()
  }
}

export const runCli = async (cwd = process.cwd()): Promise<number> => {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return runCommitFlow({
    error: message => {
      console.error(message)
    },
    git: createGitClient(cwd),
    log: message => {
      console.log(message)
    },
    prompt,
    validator: createCommitlintValidator(cwd)
  })
}
