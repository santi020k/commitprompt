import { describe, expect, test } from 'vitest'

import { formatCommitMessage } from '../src/message.js'

describe('formatCommitMessage', () => {
  test('formats a minimal conventional commit', () => {
    expect(formatCommitMessage({
      body: '',
      breaking: '',
      issues: '',
      scope: '',
      subject: 'add interactive prompt',
      type: 'feat'
    })).toBe('feat: add interactive prompt')
  })

  test('formats all optional sections', () => {
    expect(formatCommitMessage({
      body: 'Keep commit creation focused.',
      breaking: 'Node 20 is no longer supported.',
      issues: 'Closes #12',
      scope: 'cli',
      subject: 'load repository rules',
      type: 'feat'
    })).toBe([
      'feat(cli)!: load repository rules',
      'Keep commit creation focused.',
      'BREAKING CHANGE: Node 20 is no longer supported.',
      'Closes #12'
    ].join('\n\n'))
  })
})
