import type { CommitAnswers, CommitType, Prompt } from './types.js'

const askRequired = async (
  prompt: Prompt,
  error: (message: string) => void,
  question: string
): Promise<string> => {
  for (;;) {
    const answer = (await prompt.question(question)).trim()

    if (answer) return answer

    error('A value is required.')
  }
}

const askYesNo = async (
  prompt: Prompt,
  error: (message: string) => void,
  question: string,
  defaultValue = false
): Promise<boolean> => {
  for (;;) {
    const hint = defaultValue ? '[Y/n]' : '[y/N]'

    const answer = (
      await prompt.question(`${question} ${hint} `)
    ).trim().toLowerCase()

    if (!answer) return defaultValue

    if (answer === 'y' || answer === 'yes') return true

    if (answer === 'n' || answer === 'no') return false

    error('Please answer yes or no.')
  }
}

const askMultiline = async (
  prompt: Prompt,
  question: string
): Promise<string> => {
  const firstLine = (await prompt.question(question)).trim()

  if (!firstLine) return ''

  const lines = [firstLine]

  for (;;) {
    const line = (await prompt.question('… ')).trim()

    if (!line) return lines.join('\n')

    lines.push(line)
  }
}

const selectType = async (
  prompt: Prompt,
  types: readonly CommitType[],
  log: (message: string) => void,
  error: (message: string) => void
): Promise<string> => {
  if (types.length === 0) {
    throw new Error('At least one commit type is required.')
  }

  log('Select the type of change:')

  for (const [index, type] of types.entries()) {
    log(`  ${index + 1}. ${type.value.padEnd(8)} ${type.description}`)
  }

  for (;;) {
    const answer = (await prompt.question('Type: ')).trim().toLowerCase()
    const numericSelection = Number(answer)

    const selected = Number.isInteger(numericSelection)
      ? types[numericSelection - 1]
      : types.find(type => type.value === answer)

    if (selected) return selected.value

    error(`Choose 1-${types.length} or enter a listed type.`)
  }
}

const selectScope = async (
  prompt: Prompt,
  scopes: readonly string[],
  log: (message: string) => void,
  error: (message: string) => void
): Promise<string> => {
  if (scopes.length === 0) {
    return (await prompt.question('Scope (optional): ')).trim()
  }

  log('Select the scope of change:')

  for (const [index, scope] of scopes.entries()) {
    log(`  ${index + 1}. ${scope}`)
  }

  for (;;) {
    const answer = (await prompt.question('Scope (optional): ')).trim()

    if (!answer) return ''

    const numericSelection = Number(answer)

    const selected = Number.isInteger(numericSelection)
      ? scopes[numericSelection - 1]
      : scopes.find(scope => scope.toLowerCase() === answer.toLowerCase())

    if (selected) return selected

    error(`Choose 1-${scopes.length}, enter a listed scope, or leave it empty.`)
  }
}

export const collectCommitAnswers = async (
  prompt: Prompt,
  types: readonly CommitType[],
  log: (message: string) => void,
  error: (message: string) => void,
  scopes: readonly string[] = []
): Promise<CommitAnswers> => {
  const type = await selectType(prompt, types, log, error)
  const scope = await selectScope(prompt, scopes, log, error)
  const subject = await askRequired(prompt, error, 'Short imperative description: ')

  const body = await askMultiline(
    prompt,
    'Longer description (optional; finish with an empty line): '
  )

  const isBreaking = await askYesNo(
    prompt,
    error,
    'Does this include a breaking change?'
  )

  const breaking = isBreaking
    ? await askRequired(prompt, error, 'Describe the breaking change: ')
    : ''

  const issues = (
    await prompt.question('Issue references (optional, e.g. "Closes #123"): ')
  ).trim()

  return { body, breaking, issues, scope, subject, type }
}

export const confirmCommit = (
  prompt: Prompt,
  error: (message: string) => void
): Promise<boolean> => askYesNo(prompt, error, 'Create this commit?')

export const confirmRetry = (
  prompt: Prompt,
  error: (message: string) => void
): Promise<boolean> => askYesNo(prompt, error, 'Revise this commit?', true)
