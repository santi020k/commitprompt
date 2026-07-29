import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { CommitlintClient, GitClient, Prompt } from '../src/types.js'

const mocks = vi.hoisted(() => ({
  createGitClient: vi.fn(),
  createInterface: vi.fn(),
  createValidator: vi.fn()
}))

vi.mock('node:readline/promises', () => ({
  createInterface: mocks.createInterface
}))
vi.mock('../src/git.js', () => ({
  createGitClient: mocks.createGitClient
}))
vi.mock('../src/validator.js', () => ({
  createCommitlintValidator: mocks.createValidator
}))

const { runCli } = await import('../src/cli.js')

describe('runCli', () => {
  let prompt: Prompt

  beforeEach(() => {
    vi.restoreAllMocks()
    prompt = {
      close: vi.fn(),
      question: vi.fn()
    }
    mocks.createInterface.mockReturnValue(prompt)
    mocks.createGitClient.mockReturnValue({
      commit: vi.fn(),
      hasStagedChanges: () => false
    } satisfies GitClient)
    mocks.createValidator.mockReturnValue({
      getTypes: () => Promise.resolve([
        { description: 'A feature', value: 'feat' }
      ]),
      validate: vi.fn()
    } satisfies CommitlintClient)
  })

  test('loads repository types before starting the flow', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {
      // Suppress expected CLI output in the test.
    })

    await expect(runCli('/project')).resolves.toBe(1)

    expect(mocks.createGitClient).toHaveBeenCalledWith('/project')
    expect(mocks.createValidator).toHaveBeenCalledWith('/project')
    expect(error).toHaveBeenCalledWith(
      'No staged changes. Stage the files you want to commit first.'
    )
    expect(prompt.close).toHaveBeenCalledOnce()
  })

  test('reports configuration loading failures', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {
      // Suppress expected CLI output in the test.
    })

    mocks.createValidator.mockReturnValue({
      getTypes: () => Promise.reject(new Error('configuration failed')),
      validate: vi.fn()
    } satisfies CommitlintClient)

    await expect(runCli('/project')).resolves.toBe(1)

    expect(error).toHaveBeenCalledWith('configuration failed')
    expect(prompt.close).toHaveBeenCalledOnce()
  })
})
