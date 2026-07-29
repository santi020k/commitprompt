import { describe, expect, test,vi } from 'vitest'

import { runCommitFlow } from '../src/cli.js'
import type {
  GitClient,
  MessageValidator,
  Prompt,
  RunCommitFlowOptions
} from '../src/types.js'

const createOptions = (
  answers: string[],
  overrides: Partial<RunCommitFlowOptions> = {}
): RunCommitFlowOptions => {
  const git: GitClient = {
    commit: vi.fn(),
    hasStagedChanges: vi.fn(() => true)
  }
  const prompt: Prompt = {
    close: vi.fn(),
    question: vi.fn(() => Promise.resolve(answers.shift() ?? ''))
  }
  const validator: MessageValidator = {
    validate: vi.fn(() => Promise.resolve({
      errors: [],
      valid: true,
      warnings: []
    }))
  }

  return {
    error: vi.fn(),
    git,
    log: vi.fn(),
    prompt,
    types: [{ description: 'A feature', value: 'feat' }],
    validator,
    ...overrides
  }
}

describe('runCommitFlow', () => {
  test('stops before prompting when nothing is staged', async () => {
    const options = createOptions([], {
      git: {
        commit: vi.fn(),
        hasStagedChanges: () => false
      }
    })

    await expect(runCommitFlow(options)).resolves.toBe(1)
    expect(options.prompt.question).not.toHaveBeenCalled()
    expect(options.prompt.close).toHaveBeenCalledOnce()
  })

  test('validates and creates a confirmed commit', async () => {
    const options = createOptions(['feat', '', 'add a prompt', '', '', '', 'yes'])

    await expect(runCommitFlow(options)).resolves.toBe(0)
    expect(options.validator.validate).toHaveBeenCalledWith('feat: add a prompt')
    expect(options.git.commit).toHaveBeenCalledWith('feat: add a prompt')
  })

  test('does not commit an invalid message', async () => {
    const options = createOptions(['feat', '', 'Bad subject', '', '', ''], {
      validator: {
        validate: () => Promise.resolve({
          errors: ['subject-case: must be lower-case'],
          valid: false,
          warnings: []
        })
      }
    })

    await expect(runCommitFlow(options)).resolves.toBe(1)
    expect(options.git.commit).not.toHaveBeenCalled()
    expect(options.error).toHaveBeenCalledWith(
      'error: subject-case: must be lower-case'
    )
  })

  test('returns success when the user cancels', async () => {
    const options = createOptions(['feat', '', 'add a prompt', '', '', '', 'no'])

    await expect(runCommitFlow(options)).resolves.toBe(0)
    expect(options.git.commit).not.toHaveBeenCalled()
    expect(options.log).toHaveBeenCalledWith('Commit cancelled.')
  })

  test('reports unexpected failures', async () => {
    const options = createOptions([], {
      git: {
        commit: vi.fn(),
        hasStagedChanges: () => {
          throw new Error('not a Git repository')
        }
      }
    })

    await expect(runCommitFlow(options)).resolves.toBe(1)
    expect(options.error).toHaveBeenCalledWith('not a Git repository')
  })
})
