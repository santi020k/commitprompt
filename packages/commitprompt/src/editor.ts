import { DEFAULT_COMMIT_TYPES } from './constants.js'
import type { CommitType } from './types.js'

export const getCommitMessageInstructions = (
  types: readonly CommitType[]
): string => {
  const supportedTypes = types.map(type => type.value).join(', ')

  return [
    'Use Conventional Commits.',
    'Format the subject as <type>(<optional scope>): <description>.',
    `Use one of these types: ${supportedTypes}.`,
    'Write a concise, imperative, lowercase description without a trailing period.',
    'Add a body or footer only when it provides useful context.',
    'Return only the commit message.'
  ].join(' ')
}

export const COMMIT_MESSAGE_INSTRUCTIONS
  = getCommitMessageInstructions(DEFAULT_COMMIT_TYPES)
