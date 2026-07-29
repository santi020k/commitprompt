import lint from '@commitlint/lint'
import load from '@commitlint/load'
import type { LintOptions } from '@commitlint/types'

import type { MessageValidator } from './types.js'

const isParserOptions = (
  value: unknown
): value is NonNullable<LintOptions['parserOpts']> =>
  typeof value === 'object' && value !== null

export const createCommitlintValidator = (cwd: string): MessageValidator => ({
  validate: async message => {
    const configuration = await load({}, { cwd })
    const parserOptions = configuration.parserPreset?.parserOpts

    const report = await lint(message, configuration.rules, {
      defaultIgnores: configuration.defaultIgnores,
      helpUrl: configuration.helpUrl,
      ignores: configuration.ignores,
      ...(isParserOptions(parserOptions) ? { parserOpts: parserOptions } : {}),
      plugins: configuration.plugins
    })

    return {
      errors: report.errors.map(problem => `${problem.name}: ${problem.message}`),
      valid: report.valid,
      warnings: report.warnings.map(problem => `${problem.name}: ${problem.message}`)
    }
  }
})
