import process from 'node:process'
import { createInterface } from 'node:readline/promises'

import { DEFAULT_COMMIT_TYPES } from './constants.js'
import { createGitClient } from './git.js'
import { formatCommitMessage } from './message.js'
import {
  collectCommitAnswers,
  confirmCommit,
  confirmRetry
} from './prompt.js'
import type {
  MessageValidation,
  Prompt,
  RunCommitFlowOptions
} from './types.js'
import { createCommitlintValidator } from './validator.js'

type ValidationDecision = 'continue' | 'retry' | 'stop'

const writeError = (message: string): void => {
  process.stderr.write(`${message}\n`)
}

const writeOutput = (message: string): void => {
  process.stdout.write(`${message}\n`)
}

const getValidationDecision = async (
  validation: MessageValidation,
  prompt: Prompt,
  error: (message: string) => void
): Promise<ValidationDecision> => {
  for (const warning of validation.warnings) error(`warning: ${warning}`)

  if (validation.valid) return 'continue'

  for (const validationError of validation.errors) {
    error(`error: ${validationError}`)
  }

  return await confirmRetry(prompt, error) ? 'retry' : 'stop'
}

export const runCommitFlow = async ({
  error,
  git,
  log,
  prompt,
  scopes = [],
  types = DEFAULT_COMMIT_TYPES,
  validator
}: RunCommitFlowOptions): Promise<number> => {
  try {
    if (!git.hasStagedChanges()) {
      error('No staged changes. Stage the files you want to commit first.')

      return 1
    }

    for (;;) {
      const answers = await collectCommitAnswers(
        prompt, types, log, error, scopes
      )

      const message = formatCommitMessage(answers)

      log(`\n${message}\n`)

      const validation = await validator.validate(message)
      const decision = await getValidationDecision(validation, prompt, error)

      if (decision === 'retry') continue

      if (decision === 'stop') return 1

      if (!await confirmCommit(prompt, error)) {
        log('Commit cancelled.')

        return 0
      }

      git.commit(message)

      return 0
    }
  } catch (caughtError) {
    const message = caughtError instanceof Error ?
      caughtError.message :
      String(caughtError)

    error(message)

    return 1
  } finally {
    prompt.close()
  }
}

export const runCli = async (cwd = process.cwd()): Promise<number> => {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const validator = createCommitlintValidator(cwd)

  try {
    const [scopes, types] = await Promise.all([
      validator.getScopes(),
      validator.getTypes()
    ])

    return await runCommitFlow({
      error: writeError,
      git: createGitClient(cwd),
      log: writeOutput,
      prompt,
      scopes,
      types,
      validator
    })
  } catch (caughtError) {
    const message = caughtError instanceof Error ?
      caughtError.message :
      String(caughtError)

    writeError(message)

    prompt.close()

    return 1
  }
}
