import { DEFAULT_COMMIT_TYPES } from './constants.js'

const supportedTypes = DEFAULT_COMMIT_TYPES
  .map(type => type.value)
  .join(', ')

export const COMMIT_MESSAGE_INSTRUCTIONS = [
  'Use Conventional Commits.',
  'Format the subject as <type>(<optional scope>): <description>.',
  `Use one of these types: ${supportedTypes}.`,
  'Write a concise, imperative, lowercase description without a trailing period.',
  'Add a body or footer only when it provides useful context.',
  'Return only the commit message.'
].join(' ')
