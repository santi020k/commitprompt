import { COMMIT_MESSAGE_INSTRUCTIONS } from './editor.js'
import { createGitClient } from './git.js'
import { formatCommitMessage } from './message.js'
import type {
  CommitAnswers,
  MessageValidation,
  RunAutomationOptions
} from './types.js'
import { createCommitlintValidator } from './validator.js'

const answerKeys = [
  'body',
  'breaking',
  'issues',
  'scope',
  'subject',
  'type'
] as const satisfies readonly (keyof CommitAnswers)[]

const parseCommitAnswers = (input: string): CommitAnswers => {
  let value: unknown

  try {
    value = JSON.parse(input)
  }
  catch {
    throw new Error('Input must be a valid JSON object.')
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Input must be a JSON object.')
  }

  const record = value as Record<string, unknown>

  for (const key of answerKeys) {
    if (typeof record[key] !== 'string') {
      throw new TypeError(`Input field "${key}" must be a string.`)
    }
  }

  if (record.type.length === 0) {
    throw new Error('Input field "type" must not be empty.')
  }

  if (record.subject.length === 0) {
    throw new Error('Input field "subject" must not be empty.')
  }

  return {
    body: record.body,
    breaking: record.breaking,
    issues: record.issues,
    scope: record.scope,
    subject: record.subject,
    type: record.type
  }
}

const printValidation = (
  validation: MessageValidation,
  json: boolean,
  log: (message: string) => void,
  error: (message: string) => void
): void => {
  if (json) {
    log(JSON.stringify(validation))

    return
  }

  for (const warning of validation.warnings) error(`warning: ${warning}`)

  for (const validationError of validation.errors) {
    error(`error: ${validationError}`)
  }

  if (validation.valid) log('Commit message is valid.')
}

const requireInput = (input: string | undefined): string => {
  if (input === undefined || input.trim().length === 0) {
    throw new Error('This command requires input from stdin or --input <path>.')
  }

  return input
}

export const runAutomation = async ({
  command,
  confirm = false,
  cwd,
  error,
  input,
  json = false,
  log
}: RunAutomationOptions): Promise<number> => {
  try {
    if (command === 'instructions') {
      log(json
        ? JSON.stringify({ instructions: COMMIT_MESSAGE_INSTRUCTIONS })
        : COMMIT_MESSAGE_INSTRUCTIONS)

      return 0
    }

    const validator = createCommitlintValidator(cwd)

    if (command === 'types') {
      const types = await validator.getTypes()

      log(json ? JSON.stringify({ types }) : types
        .map(type => `${type.value}\t${type.description}`)
        .join('\n'))

      return 0
    }

    if (command === 'validate') {
      const validation = await validator.validate(requireInput(input).trimEnd())

      printValidation(validation, json, log, error)

      return validation.valid ? 0 : 1
    }

    const message = formatCommitMessage(parseCommitAnswers(requireInput(input)))

    if (command === 'format') {
      log(json ? JSON.stringify({ message }) : message)

      return 0
    }

    if (!confirm) {
      throw new Error(
        'Non-interactive commits require --yes to confirm the Git operation.'
      )
    }

    const validation = await validator.validate(message)

    if (!validation.valid) {
      if (json) {
        log(JSON.stringify({ committed: false, message, validation }))
      }
      else {
        printValidation(validation, false, log, error)
      }

      return 1
    }

    const git = createGitClient(cwd)

    if (!git.hasStagedChanges()) {
      throw new Error('No staged changes. Stage the files you want to commit first.')
    }

    git.commit(message)

    log(json
      ? JSON.stringify({ committed: true, message, validation })
      : `Created commit:\n${message}`)

    return 0
  }
  catch (caughtError) {
    const message = caughtError instanceof Error
      ? caughtError.message
      : String(caughtError)

    error(json ? JSON.stringify({ error: message }) : message)

    return 1
  }
}
