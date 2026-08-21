import lintImplementation from '@commitlint/lint'
import type {
  LintOptions,
  LintOutcome,
  QualifiedRules
} from '@commitlint/types'

const lint = async (
  message: string,
  rules?: QualifiedRules,
  options?: LintOptions
): Promise<LintOutcome> => await lintImplementation(message, rules, options)

export default lint
