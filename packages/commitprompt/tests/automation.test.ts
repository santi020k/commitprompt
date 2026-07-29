import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { CommitlintClient, GitClient } from '../src/types.js'

const mocks = vi.hoisted(() => ({
  createGitClient: vi.fn(),
  createValidator: vi.fn()
}))

vi.mock('../src/git.js', () => ({
  createGitClient: mocks.createGitClient
}))
vi.mock('../src/validator.js', () => ({
  createCommitlintValidator: mocks.createValidator
}))

const { runAutomation } = await import('../src/automation.js')

const answers = JSON.stringify({
  body: '',
  breaking: '',
  issues: '',
  scope: 'cli',
  subject: 'accept structured input',
  type: 'feat'
})

const createOptions = () => ({
  command: 'format' as const,
  cwd: '/project',
  error: vi.fn(),
  input: answers,
  log: vi.fn()
})

describe('runAutomation', () => {
  let git: GitClient
  let validator: CommitlintClient

  beforeEach(() => {
    vi.restoreAllMocks()
    git = {
      commit: vi.fn(),
      hasStagedChanges: vi.fn(() => true)
    }
    validator = {
      getTypes: vi.fn(() => Promise.resolve([
        { description: 'A feature', value: 'feat' }
      ])),
      validate: vi.fn(() => Promise.resolve({
        errors: [],
        valid: true,
        warnings: []
      }))
    }
    mocks.createGitClient.mockReturnValue(git)
    mocks.createValidator.mockReturnValue(validator)
  })

  test('formats structured JSON as a commit message', async () => {
    const options = createOptions()

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(options.log).toHaveBeenCalledWith(
      'feat(cli): accept structured input'
    )
  })

  test('reports formatted output as JSON', async () => {
    const options = { ...createOptions(), json: true }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(options.log).toHaveBeenCalledWith(JSON.stringify({
      message: 'feat(cli): accept structured input'
    }))
  })

  test('rejects incomplete structured input', async () => {
    const options = {
      ...createOptions(),
      input: JSON.stringify({ type: 'feat' }),
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(options.error).toHaveBeenCalledWith(JSON.stringify({
      error: 'Input field "body" must be a string.'
    }))
  })

  test('validates a message with repository rules', async () => {
    const options = {
      ...createOptions(),
      command: 'validate' as const,
      input: 'feat: accept structured input\n',
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(validator.validate).toHaveBeenCalledWith(
      'feat: accept structured input'
    )
    expect(options.log).toHaveBeenCalledWith(JSON.stringify({
      errors: [],
      valid: true,
      warnings: []
    }))
  })

  test('returns a failure status for invalid messages', async () => {
    validator.validate = vi.fn(() => Promise.resolve({
      errors: ['type-enum: type must be one of [feat]'],
      valid: false,
      warnings: []
    }))
    const options = {
      ...createOptions(),
      command: 'validate' as const,
      input: 'invalid',
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(options.log).toHaveBeenCalledWith(JSON.stringify({
      errors: ['type-enum: type must be one of [feat]'],
      valid: false,
      warnings: []
    }))
  })

  test('lists repository-aware commit types', async () => {
    const options = {
      ...createOptions(),
      command: 'types' as const,
      input: undefined,
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(options.log).toHaveBeenCalledWith(JSON.stringify({
      types: [{ description: 'A feature', value: 'feat' }]
    }))
  })

  test('requires explicit confirmation for non-interactive commits', async () => {
    const options = {
      ...createOptions(),
      command: 'commit' as const,
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(git.commit).not.toHaveBeenCalled()
    expect(options.error).toHaveBeenCalledWith(JSON.stringify({
      error: 'Non-interactive commits require --yes to confirm the Git operation.'
    }))
  })

  test('validates and commits structured input after confirmation', async () => {
    const options = {
      ...createOptions(),
      command: 'commit' as const,
      confirm: true,
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(validator.validate).toHaveBeenCalledWith(
      'feat(cli): accept structured input'
    )
    expect(git.hasStagedChanges).toHaveBeenCalledOnce()
    expect(git.commit).toHaveBeenCalledWith(
      'feat(cli): accept structured input'
    )
    expect(options.log).toHaveBeenCalledWith(JSON.stringify({
      committed: true,
      message: 'feat(cli): accept structured input',
      validation: {
        errors: [],
        valid: true,
        warnings: []
      }
    }))
  })

  test('does not commit invalid structured input', async () => {
    validator.validate = vi.fn(() => Promise.resolve({
      errors: ['subject-case: subject must be lower-case'],
      valid: false,
      warnings: []
    }))
    const options = {
      ...createOptions(),
      command: 'commit' as const,
      confirm: true,
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(git.hasStagedChanges).not.toHaveBeenCalled()
    expect(git.commit).not.toHaveBeenCalled()
  })
})
