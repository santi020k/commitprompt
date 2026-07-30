import { beforeEach, describe, expect, test, vi } from 'vitest'

import { DEFAULT_COMMIT_TYPES } from '../src/constants.js'
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
      extends: ['@commitlint/config-conventional'],
      formatter: '',
      helpUrl: 'https://commitlint.js.org',
      ignores: [],
      parserPreset: {
        parserOpts: {
          headerPattern: /^(.*)$/
        }
      },
      plugins: {},
      prompt: {},
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
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith({}, { cwd: '/project' })
    expect(mocks.lint).toHaveBeenCalledWith(
      'feat: add validation', { 'type-empty': [2, 'never'] }, expect.objectContaining({
        parserOpts: {
          headerPattern: /^(.*)$/
        }
      })
    )
    await expect(validator.getScopes()).resolves.toEqual([])
    await expect(validator.getTypes()).resolves.toHaveLength(11)
  })

  test('maps errors and warnings without invalid parser options', async () => {
    mocks.load.mockResolvedValue({
      defaultIgnores: true,
      extends: [],
      formatter: '',
      helpUrl: '',
      ignores: [],
      parserPreset: { parserOpts: 'invalid' },
      plugins: {},
      prompt: {},
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

  test('uses built-in conventional rules when the repository has no config', async () => {
    mocks.load.mockResolvedValue({
      defaultIgnores: true,
      extends: [],
      formatter: '',
      helpUrl: '',
      ignores: [],
      parserPreset: undefined,
      plugins: {},
      prompt: {},
      rules: {}
    })

    const validator = createCommitlintValidator('/project')

    await validator.validate('feat: use defaults')
    await expect(validator.getTypes()).resolves.toEqual(DEFAULT_COMMIT_TYPES)

    const ruleNames = Object.keys(
      mocks.lint.mock.calls[0]?.[1] as Record<string, unknown>
    )

    expect(ruleNames).toEqual(expect.arrayContaining([
      'subject-empty',
      'type-enum'
    ]))
  })

  test('derives prompt types from the repository type-enum rule', async () => {
    mocks.load.mockResolvedValue({
      defaultIgnores: true,
      extends: [],
      formatter: '',
      helpUrl: '',
      ignores: [],
      parserPreset: undefined,
      plugins: {},
      prompt: {},
      rules: {
        'type-enum': [2, 'always', ['fix', 'release']]
      }
    })

    await expect(
      createCommitlintValidator('/project').getTypes()
    ).resolves.toEqual([
      { description: 'A bug fix', value: 'fix' },
      { description: 'A repository-defined change', value: 'release' }
    ])
  })

  test('excludes types forbidden by a never rule', async () => {
    mocks.load.mockResolvedValue({
      defaultIgnores: true,
      extends: [],
      formatter: '',
      helpUrl: '',
      ignores: [],
      parserPreset: undefined,
      plugins: {},
      prompt: {},
      rules: {
        'type-enum': [2, 'never', ['chore', 'revert']]
      }
    })

    const types = await createCommitlintValidator('/project').getTypes()

    expect(types.map(type => type.value)).not.toContain('chore')
    expect(types.map(type => type.value)).not.toContain('revert')
    expect(types.map(type => type.value)).toContain('feat')
  })

  test('derives prompt scopes from the repository scope-enum rule', async () => {
    mocks.load.mockResolvedValue({
      defaultIgnores: true,
      extends: [],
      formatter: '',
      helpUrl: '',
      ignores: [],
      parserPreset: undefined,
      plugins: {},
      prompt: {},
      rules: {
        'scope-enum': [2, 'always', ['cli', 'docs', 'cli', '']]
      }
    })

    await expect(
      createCommitlintValidator('/project').getScopes()
    ).resolves.toEqual(['cli', 'docs'])
  })

  test.each([
    [0, 'always'],
    [2, 'never']
  ] as const)('does not suggest scopes for a %s %s rule', async (
    severity,
    condition
  ) => {
    mocks.load.mockResolvedValue({
      defaultIgnores: true,
      extends: [],
      formatter: '',
      helpUrl: '',
      ignores: [],
      parserPreset: undefined,
      plugins: {},
      prompt: {},
      rules: {
        'scope-enum': [severity, condition, ['internal']]
      }
    })

    await expect(
      createCommitlintValidator('/project').getScopes()
    ).resolves.toEqual([])
  })
})
