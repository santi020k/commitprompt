import conventionalConfig from '@commitlint/config-conventional'
import type {
  LintOptions,
  QualifiedConfig,
  QualifiedRules
} from '@commitlint/types'
import { RuleConfigSeverity } from '@commitlint/types'

import lint from './commitlint-lint.js'
import { loadCommitlintConfiguration } from './configuration.js'
import { DEFAULT_COMMIT_TYPES } from './constants.js'
import type { CommitlintClient, CommitType } from './types.js'

const isParserOptions = (
  value: unknown
): value is NonNullable<LintOptions['parserOpts']> => typeof value === 'object' && value !== null

const hasRepositoryConfiguration = (configuration: QualifiedConfig): boolean => configuration.extends.length > 0 ||
  Object.keys(configuration.rules).length > 0 ||
  configuration.parserPreset !== undefined

const getDefaultRules = (): QualifiedRules => conventionalConfig.rules

interface LoadedConfiguration {
  configuration: QualifiedConfig
  usesDefaults: boolean
}

const loadConfiguration = async (cwd: string): Promise<LoadedConfiguration> => {
  const configuration = await loadCommitlintConfiguration(cwd)

  if (hasRepositoryConfiguration(configuration)) {
    return { configuration, usesDefaults: false }
  }

  return {
    configuration: {
      ...configuration,
      rules: getDefaultRules()
    },
    usesDefaults: true
  }
}

const describeType = (value: string): CommitType => {
  const knownType = DEFAULT_COMMIT_TYPES.find(type => type.value === value)

  return knownType ?? {
    description: 'A repository-defined change',
    value
  }
}

const isDefaultTypeSet = (values: readonly string[]): boolean => {
  if (values.length !== DEFAULT_COMMIT_TYPES.length) return false

  const configuredValues = new Set(values)

  return DEFAULT_COMMIT_TYPES.every(type => configuredValues.has(type.value))
}

const getConfiguredTypes = (
  configuration: QualifiedConfig
): readonly CommitType[] => {
  const typeRule = configuration.rules['type-enum']

  if (
    !typeRule ||
    typeRule[0] === RuleConfigSeverity.Disabled ||
    !Array.isArray(typeRule[2])
  ) {
    return DEFAULT_COMMIT_TYPES
  }

  const configuredValues = typeRule[2].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )

  if (typeRule[1] === 'never') {
    const excludedValues = new Set(configuredValues)

    const allowedTypes = DEFAULT_COMMIT_TYPES.filter(
      type => !excludedValues.has(type.value)
    )

    return allowedTypes.length > 0 ? allowedTypes : DEFAULT_COMMIT_TYPES
  }

  if (isDefaultTypeSet(configuredValues)) return DEFAULT_COMMIT_TYPES

  const types = configuredValues.map(describeType)

  return types.length > 0 ? types : DEFAULT_COMMIT_TYPES
}

const getConfiguredScopes = (
  configuration: QualifiedConfig
): readonly string[] => {
  const scopeRule = configuration.rules['scope-enum']

  if (
    !scopeRule ||
    scopeRule[0] === RuleConfigSeverity.Disabled ||
    scopeRule[1] === 'never' ||
    !Array.isArray(scopeRule[2])
  ) {
    return []
  }

  return [...new Set(scopeRule[2].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  ))]
}

export const createCommitlintValidator = (cwd: string): CommitlintClient => {
  const configuration = loadConfiguration(cwd)

  return {
    getScopes: async () => {
      const loaded = await configuration

      return loaded.usesDefaults ?
        [] :
        getConfiguredScopes(loaded.configuration)
    },
    getTypes: async () => {
      const loaded = await configuration

      return loaded.usesDefaults ?
        DEFAULT_COMMIT_TYPES :
        getConfiguredTypes(loaded.configuration)
    },
    validate: async message => {
      const { configuration: resolvedConfiguration } = await configuration
      const parserOptions = resolvedConfiguration.parserPreset?.parserOpts

      const report = await lint(message, resolvedConfiguration.rules, {
        defaultIgnores: resolvedConfiguration.defaultIgnores,
        helpUrl: resolvedConfiguration.helpUrl,
        ignores: resolvedConfiguration.ignores,
        ...(isParserOptions(parserOptions) ? { parserOpts: parserOptions } : {}),
        plugins: resolvedConfiguration.plugins
      })

      return {
        errors: report.errors.map(problem => `${problem.name}: ${problem.message}`),
        valid: report.valid,
        warnings: report.warnings.map(problem => `${problem.name}: ${problem.message}`)
      }
    }
  }
}
