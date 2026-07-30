import { getCommitMessageInstructions } from './editor.js'
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
  } catch {
    throw new Error('Input must be a valid JSON object.')
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Input must be a JSON object.')
  }

  const record = value as Record<string, unknown>

  const getAnswer = (key: keyof CommitAnswers): string => {
    const answer = record[key]

    if (typeof answer !== 'string') {
      throw new TypeError(`Input field "${key}" must be a string.`)
    }

    return answer
  }

  const answers = Object.fromEntries(
    answerKeys.map(key => [key, getAnswer(key)])
  ) as unknown as CommitAnswers

  if (answers.type.length === 0) {
    throw new Error('Input field "type" must not be empty.')
  }

  if (answers.subject.length === 0) {
    throw new Error('Input field "subject" must not be empty.')
  }

  return answers
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

type NormalizedAutomationOptions = Omit<
  RunAutomationOptions,
  'confirm' | 'json'
> & {
  confirm: boolean
  json: boolean
}

const runInstructions = async ({
  cwd,
  json,
  log
}: NormalizedAutomationOptions): Promise<number> => {
  const validator = createCommitlintValidator(cwd)

  const [scopes, types] = await Promise.all([
    validator.getScopes(),
    validator.getTypes()
  ])

  const instructions = getCommitMessageInstructions(types, scopes)

  log(json ? JSON.stringify({ instructions }) : instructions)

  return 0
}

const runScopes = async ({
  cwd,
  json,
  log
}: NormalizedAutomationOptions): Promise<number> => {
  const scopes = await createCommitlintValidator(cwd).getScopes()

  log(json ? JSON.stringify({ scopes }) : scopes.join('\n'))

  return 0
}

const runTypes = async ({
  cwd,
  json,
  log
}: NormalizedAutomationOptions): Promise<number> => {
  const types = await createCommitlintValidator(cwd).getTypes()

  log(json ?
    JSON.stringify({ types }) :
    types
      .map(type => `${type.value}\t${type.description}`)
      .join('\n'))

  return 0
}

const runValidation = async ({
  cwd,
  error,
  input,
  json,
  log
}: NormalizedAutomationOptions): Promise<number> => {
  const validator = createCommitlintValidator(cwd)
  const validation = await validator.validate(requireInput(input).trimEnd())

  printValidation(validation, json, log, error)

  return validation.valid ? 0 : 1
}

const getFormattedMessage = (
  input: string | undefined
): string => formatCommitMessage(parseCommitAnswers(requireInput(input)))

const runFormat = ({
  input,
  json,
  log
}: NormalizedAutomationOptions): number => {
  const message = getFormattedMessage(input)

  log(json ? JSON.stringify({ message }) : message)

  return 0
}

const runCommit = async ({
  confirm,
  cwd,
  error,
  input,
  json,
  log
}: NormalizedAutomationOptions): Promise<number> => {
  if (!confirm) {
    throw new Error(
      'Non-interactive commits require --yes to confirm the Git operation.'
    )
  }

  const message = getFormattedMessage(input)
  const validation = await createCommitlintValidator(cwd).validate(message)

  if (!validation.valid) {
    if (json) {
      log(JSON.stringify({ committed: false, message, validation }))
    } else {
      printValidation(validation, false, log, error)
    }

    return 1
  }

  const git = createGitClient(cwd, { silent: true })

  if (!git.hasStagedChanges()) {
    throw new Error('No staged changes. Stage the files you want to commit first.')
  }

  git.commit(message)

  log(json ?
    JSON.stringify({ committed: true, message, validation }) :
    `Created commit:\n${message}`)

  return 0
}

const runAutomationAction = async (
  options: NormalizedAutomationOptions
): Promise<number> => {
  switch (options.command) {
    case 'commit': {
      return await runCommit(options)
    }

    case 'format': {
      return runFormat(options)
    }

    case 'instructions': {
      return await runInstructions(options)
    }

    case 'scopes': {
      return await runScopes(options)
    }

    case 'types': {
      return await runTypes(options)
    }

    case 'validate': {
      return await runValidation(options)
    }
  }
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
    return await runAutomationAction({
      command,
      confirm,
      cwd,
      error,
      input,
      json,
      log
    })
  } catch (caughtError) {
    const message = caughtError instanceof Error ?
      caughtError.message :
      String(caughtError)

    error(json ? JSON.stringify({ error: message }) : message)

    return 1
  }
}
