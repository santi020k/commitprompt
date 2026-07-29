import type { CommitAnswers } from './types.js'

export const formatCommitMessage = ({
  body,
  breaking,
  issues,
  scope,
  subject,
  type
}: CommitAnswers): string => {
  const header = `${type}${scope ? `(${scope})` : ''}${breaking ? '!' : ''}: ${subject}`

  const paragraphs = [
    body,
    breaking ? `BREAKING CHANGE: ${breaking}` : '',
    issues
  ].filter(Boolean)

  return [header, ...paragraphs].join('\n\n')
}
