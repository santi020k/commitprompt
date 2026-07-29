import { describe, expect, test,vi } from 'vitest'

import { collectCommitAnswers, confirmCommit } from '../src/prompt.js'
import type { Prompt } from '../src/types.js'

const createPrompt = (answers: string[]): Prompt => ({
  close: vi.fn(),
  question: vi.fn(() => Promise.resolve(answers.shift() ?? ''))
})

describe('collectCommitAnswers', () => {
  test('accepts a numbered type and optional values', async () => {
    const prompt = createPrompt(['1', 'cli', 'add prompt', '', 'n', 'Closes #1'])

    await expect(collectCommitAnswers(
      prompt,
      [{ description: 'A feature', value: 'feat' }],
      vi.fn(),
      vi.fn()
    )).resolves.toEqual({
      body: '',
      breaking: '',
      issues: 'Closes #1',
      scope: 'cli',
      subject: 'add prompt',
      type: 'feat'
    })
  })

  test('retries invalid and required answers', async () => {
    const prompt = createPrompt([
      'unknown',
      'fix',
      '',
      '',
      'repair selection',
      '',
      'maybe',
      'yes',
      '',
      'remove the old command',
      ''
    ])
    const error = vi.fn()

    const answers = await collectCommitAnswers(
      prompt,
      [{ description: 'A bug fix', value: 'fix' }],
      vi.fn(),
      error
    )

    expect(answers.breaking).toBe('remove the old command')
    expect(error).toHaveBeenCalledTimes(4)
  })
})

describe('confirmCommit', () => {
  test('defaults to no', async () => {
    await expect(confirmCommit(createPrompt(['']), vi.fn())).resolves.toBe(false)
  })
})
