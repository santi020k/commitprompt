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
      getScopes: vi.fn(() => Promise.resolve([])),
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
    expect(mocks.createValidator).not.toHaveBeenCalled()
    expect(options.log).toHaveBeenCalledWith(
      'feat(cli): accept structured input'
    )
  })

  test('returns model instructions with repository-aware types', async () => {
    validator.getTypes = vi.fn(() => Promise.resolve([
      { description: 'A release', value: 'release' }
    ]))
    const options = {
      ...createOptions(),
      command: 'instructions' as const,
      input: undefined,
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(mocks.createValidator).toHaveBeenCalledWith('/project')
    expect(validator.getScopes).toHaveBeenCalledOnce()
    expect(validator.getTypes).toHaveBeenCalledOnce()
    expect(options.log).toHaveBeenCalledWith(
      expect.stringContaining('Use one of these types: release.')
    )
    expect(options.log).not.toHaveBeenCalledWith(
      expect.stringContaining('feat')
    )
  })

  test('returns plain model instructions', async () => {
    const options = {
      ...createOptions(),
      command: 'instructions' as const,
      input: undefined
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(validator.getScopes).toHaveBeenCalledOnce()
    expect(validator.getTypes).toHaveBeenCalledOnce()
    expect(options.log).toHaveBeenCalledWith(
      expect.stringContaining('Use one of these types: feat.')
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

  test.each([
    ['invalid JSON', '{', 'Input must be a valid JSON object.'],
    ['a non-object', '[]', 'Input must be a JSON object.'],
    [
      'an empty type',
      JSON.stringify({
        body: '',
        breaking: '',
        issues: '',
        scope: '',
        subject: 'describe change',
        type: ''
      }),
      'Input field "type" must not be empty.'
    ],
    [
      'an empty subject',
      JSON.stringify({
        body: '',
        breaking: '',
        issues: '',
        scope: '',
        subject: '',
        type: 'feat'
      }),
      'Input field "subject" must not be empty.'
    ]
  ])('rejects %s', async (_label, input, expectedError) => {
    const options = { ...createOptions(), input }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(options.error).toHaveBeenCalledWith(expectedError)
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

  test('explains how to correct a blocked commit message', async () => {
    validator.validate = vi.fn(() => Promise.resolve({
      errors: ['type-enum: type must be one of [feat]'],
      valid: false,
      warnings: []
    }))
    const options = {
      ...createOptions(),
      command: 'validate' as const,
      input: 'invalid'
    }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(options.error).toHaveBeenCalledWith(
      'Commit blocked: the message does not satisfy this repository\'s rules.'
    )
    expect(options.error).toHaveBeenCalledWith(
      expect.stringContaining('Correct the message in Zed or VS Code')
    )
  })

  test('prints plain validation warnings and success', async () => {
    validator.validate = vi.fn(() => Promise.resolve({
      errors: [],
      valid: true,
      warnings: ['body-max-line-length: body is long']
    }))
    const options = {
      ...createOptions(),
      command: 'validate' as const,
      input: 'feat: valid'
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(options.error).toHaveBeenCalledWith(
      'warning: body-max-line-length: body is long'
    )
    expect(options.log).toHaveBeenCalledWith('Commit message is valid.')
  })

  test('reports missing validation input', async () => {
    const options = {
      ...createOptions(),
      command: 'validate' as const,
      input: ''
    }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(options.error).toHaveBeenCalledWith(
      'This command requires input from stdin or --input <path>.'
    )
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

  test('lists repository-aware commit types as text', async () => {
    const options = {
      ...createOptions(),
      command: 'types' as const,
      input: undefined
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(options.log).toHaveBeenCalledWith('feat\tA feature')
  })

  test('lists repository-aware scopes', async () => {
    validator.getScopes = vi.fn(() => Promise.resolve(['cli', 'docs']))
    const options = {
      ...createOptions(),
      command: 'scopes' as const,
      input: undefined,
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(options.log).toHaveBeenCalledWith(JSON.stringify({
      scopes: ['cli', 'docs']
    }))
  })

  test('adds repository scopes to model instructions', async () => {
    validator.getScopes = vi.fn(() => Promise.resolve(['cli', 'docs']))
    const options = {
      ...createOptions(),
      command: 'instructions' as const,
      input: undefined
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(options.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Use one of these scopes when a scope is appropriate: cli, docs.'
      )
    )
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

  test('prints plain validation errors before stopping a commit', async () => {
    validator.validate = vi.fn(() => Promise.resolve({
      errors: ['subject-case: subject must be lower-case'],
      valid: false,
      warnings: []
    }))
    const options = {
      ...createOptions(),
      command: 'commit' as const,
      confirm: true
    }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(options.error).toHaveBeenCalledWith(
      'error: subject-case: subject must be lower-case'
    )
    expect(options.error).toHaveBeenCalledWith(
      expect.stringContaining('Commit blocked')
    )
  })

  test('stops an automated commit when nothing is staged', async () => {
    git.hasStagedChanges = vi.fn(() => false)
    const options = {
      ...createOptions(),
      command: 'commit' as const,
      confirm: true,
      json: true
    }

    await expect(runAutomation(options)).resolves.toBe(1)
    expect(git.commit).not.toHaveBeenCalled()
    expect(options.error).toHaveBeenCalledWith(JSON.stringify({
      error: 'No staged changes. Stage the files you want to commit first.'
    }))
  })

  test('reports a successful automated commit as text', async () => {
    const options = {
      ...createOptions(),
      command: 'commit' as const,
      confirm: true
    }

    await expect(runAutomation(options)).resolves.toBe(0)
    expect(options.log).toHaveBeenCalledWith(
      'Created commit:\nfeat(cli): accept structured input'
    )
  })
})
