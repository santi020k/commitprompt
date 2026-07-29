import { DEFAULT_COMMIT_TYPES } from './constants.js'
import type { CommitType } from './types.js'

export const getCommitMessageInstructions = (
  types: readonly CommitType[],
  scopes: readonly string[] = []
): string => {
  const supportedTypes = types.map(type => type.value).join(', ')

  return [
    'Use Conventional Commits.',
    'Format the subject as <type>(<optional scope>): <description>.',
    `Use one of these types: ${supportedTypes}.`,
    scopes.length > 0
      ? `Use one of these scopes when a scope is appropriate: ${scopes.join(', ')}.`
      : '',
    'Write a concise, imperative, lowercase description without a trailing period.',
    'Add a body or footer only when it provides useful context.',
    'Return only the commit message.'
  ].filter(Boolean).join(' ')
}

export const COMMIT_MESSAGE_INSTRUCTIONS
  = getCommitMessageInstructions(DEFAULT_COMMIT_TYPES)
