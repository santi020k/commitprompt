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
  question: string
): Promise<boolean> => {
  for (;;) {
    const answer = (await prompt.question(`${question} [y/N] `)).trim().toLowerCase()

    if (!answer || answer === 'n' || answer === 'no') return false

    if (answer === 'y' || answer === 'yes') return true

    error('Please answer yes or no.')
  }
}

const selectType = async (
  prompt: Prompt,
  types: readonly CommitType[],
  log: (message: string) => void,
  error: (message: string) => void
): Promise<string> => {
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

export const collectCommitAnswers = async (
  prompt: Prompt,
  types: readonly CommitType[],
  log: (message: string) => void,
  error: (message: string) => void
): Promise<CommitAnswers> => {
  const type = await selectType(prompt, types, log, error)
  const scope = (await prompt.question('Scope (optional): ')).trim()
  const subject = await askRequired(prompt, error, 'Short imperative description: ')
  const body = (await prompt.question('Longer description (optional): ')).trim()

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
