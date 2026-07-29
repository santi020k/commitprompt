import { describe, expect, test, vi } from 'vitest'

import {
  collectCommitAnswers,
  confirmCommit,
  confirmRetry
} from '../src/prompt.js'
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

  test('collects a multiline body', async () => {
    const prompt = createPrompt([
      'feat',
      '',
      'add prompt',
      'First paragraph.',
      'Second paragraph.',
      '',
      'n',
      ''
    ])

    const answers = await collectCommitAnswers(
      prompt,
      [{ description: 'A feature', value: 'feat' }],
      vi.fn(),
      vi.fn()
    )

    expect(answers.body).toBe('First paragraph.\nSecond paragraph.')
  })

  test('accepts a configured scope by number', async () => {
    const prompt = createPrompt(['feat', '2', 'update docs', '', 'n', ''])
    const log = vi.fn()

    const answers = await collectCommitAnswers(
      prompt,
      [{ description: 'A feature', value: 'feat' }],
      log,
      vi.fn(),
      ['cli', 'docs']
    )

    expect(answers.scope).toBe('docs')
    expect(log).toHaveBeenCalledWith('Select the scope of change:')
  })

  test('accepts an empty configured scope and retries unknown scopes', async () => {
    const prompt = createPrompt([
      'feat',
      'unknown',
      '',
      'update project',
      '',
      'n',
      ''
    ])
    const error = vi.fn()

    const answers = await collectCommitAnswers(
      prompt,
      [{ description: 'A feature', value: 'feat' }],
      vi.fn(),
      error,
      ['cli', 'docs']
    )

    expect(answers.scope).toBe('')
    expect(error).toHaveBeenCalledWith(
      'Choose 1-2, enter a listed scope, or leave it empty.'
    )
  })

  test('rejects an empty type list', async () => {
    await expect(collectCommitAnswers(
      createPrompt([]),
      [],
      vi.fn(),
      vi.fn()
    )).rejects.toThrow('At least one commit type is required.')
  })
})

describe('confirmCommit', () => {
  test('defaults to no', async () => {
    await expect(confirmCommit(createPrompt(['']), vi.fn())).resolves.toBe(false)
  })

  test('defaults revision to yes', async () => {
    await expect(confirmRetry(createPrompt(['']), vi.fn())).resolves.toBe(true)
  })
})
