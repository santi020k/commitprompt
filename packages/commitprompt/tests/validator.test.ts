import { beforeEach, describe, expect, test,vi } from 'vitest'

import { createCommitlintValidator } from '../src/validator.js'

const mocks = vi.hoisted(() => ({
  lint: vi.fn(),
  load: vi.fn()
}))

vi.mock('@commitlint/lint', () => ({ default: mocks.lint }))
vi.mock('@commitlint/load', () => ({ default: mocks.load }))

describe('createCommitlintValidator', () => {
  beforeEach(() => {
    mocks.lint.mockReset()
    mocks.load.mockReset()
    mocks.load.mockResolvedValue({
      defaultIgnores: true,
      helpUrl: 'https://commitlint.js.org',
      ignores: [],
      parserPreset: {
        parserOpts: {
          headerPattern: /^(.*)$/
        }
      },
      plugins: {},
      rules: {
        'type-empty': [2, 'never']
      }
    })
    mocks.lint.mockResolvedValue({
      errors: [],
      input: 'feat: add validation',
      valid: true,
      warnings: []
    })
  })

  test('loads repository configuration and maps a valid report', async () => {
    const validator = createCommitlintValidator('/project')

    await expect(validator.validate('feat: add validation')).resolves.toEqual({
      errors: [],
      valid: true,
      warnings: []
    })
    expect(mocks.load).toHaveBeenCalledWith({}, { cwd: '/project' })
    expect(mocks.lint).toHaveBeenCalledWith(
      'feat: add validation',
      { 'type-empty': [2, 'never'] },
      expect.objectContaining({
        parserOpts: {
          headerPattern: /^(.*)$/
        }
      })
    )
  })

  test('maps errors and warnings without invalid parser options', async () => {
    mocks.load.mockResolvedValue({
      defaultIgnores: true,
      helpUrl: '',
      ignores: [],
      parserPreset: { parserOpts: 'invalid' },
      plugins: {},
      rules: {}
    })
    mocks.lint.mockResolvedValue({
      errors: [{ message: 'type may not be empty', name: 'type-empty' }],
      input: 'invalid',
      valid: false,
      warnings: [{ message: 'subject is long', name: 'subject-max-length' }]
    })

    await expect(
      createCommitlintValidator('/project').validate('invalid')
    ).resolves.toEqual({
      errors: ['type-empty: type may not be empty'],
      valid: false,
      warnings: ['subject-max-length: subject is long']
    })
    expect(mocks.lint.mock.calls[0]?.[2]).not.toHaveProperty('parserOpts')
  })
})
