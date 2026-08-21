import {
  existsSync,
  readFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import {
  dirname,
  isAbsolute,
  join
} from 'node:path'
import {
  fileURLToPath,
  pathToFileURL
} from 'node:url'

import { validateConfig } from '@commitlint/config-validator'
import executeRule from '@commitlint/execute-rule'
import type {
  ParserPreset,
  Plugin,
  PluginRecords,
  QualifiedConfig,
  QualifiedRules,
  UserConfig,
  UserPromptConfig
} from '@commitlint/types'
import type { Loader } from 'cosmiconfig'
import {
  cosmiconfig,
  defaultLoaders
} from 'cosmiconfig'

const CONFIGURATION_NAME = 'commitlint'
const DEFAULT_FORMATTER = '@commitlint/format'

const DEFAULT_HELP_URL =
  'https://github.com/conventional-changelog/commitlint/#what-is-commitlint'

const require = createRequire(import.meta.url)

const SEARCH_PLACES = [
  'package.json',
  'package.yaml',
  '.commitlintrc',
  '.commitlintrc.json',
  '.commitlintrc.yaml',
  '.commitlintrc.yml',
  '.commitlintrc.js',
  '.commitlintrc.cjs',
  '.commitlintrc.mjs',
  'commitlint.config.js',
  'commitlint.config.cjs',
  'commitlint.config.mjs',
  '.commitlintrc.ts',
  '.commitlintrc.cts',
  '.commitlintrc.mts',
  'commitlint.config.ts',
  'commitlint.config.cts',
  'commitlint.config.mts'
] as const

interface LoadedRepositoryConfiguration {
  config: UserConfig
  filepath?: string
}

interface ParserFactoryResult {
  parser?: unknown
  parserOpts?: unknown
}

type ParserFactory = (
  callback: (
    error: unknown,
    result?: ParserFactoryResult
  ) => void
) => ParserFactoryResult | Promise<ParserFactoryResult> | undefined

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value)
const toError = (value: unknown): Error => value instanceof Error ? value : new Error(String(value))

const isConfigurationFunction = (
  value: unknown
): value is () => unknown => typeof value === 'function'

const isParserFactory = (
  value: unknown
): value is ParserFactory => typeof value === 'function'

const unwrapDefault = (value: unknown): unknown => isRecord(value) && 'default' in value ? value.default : value

const loadTypeScript: Loader = async path => {
  const imported: unknown = await import(pathToFileURL(path).href)

  return unwrapDefault(imported)
}

const loadCommonJsTypeScript: Loader = async path => {
  const imported: unknown = require(path)

  return await imported
}

const resolveConfiguration = async (
  value: unknown
): Promise<unknown> => {
  const awaited: unknown = await value

  if (!isConfigurationFunction(awaited)) return awaited

  const resolved: unknown = awaited()

  return await resolved
}

const loadRepositoryConfiguration = async (
  cwd: string
): Promise<LoadedRepositoryConfiguration> => {
  const explorer = cosmiconfig(CONFIGURATION_NAME, {
    loaders: {
      '.cjs': defaultLoaders['.cjs'],
      '.cts': loadCommonJsTypeScript,
      '.js': defaultLoaders['.js'],
      '.mts': loadTypeScript,
      '.ts': loadTypeScript
    },
    searchPlaces: [...SEARCH_PLACES],
    searchStrategy: 'global'
  })

  const result = await explorer.search(cwd)

  if (result === null) return { config: {} }

  const config = await resolveConfiguration(result.config)

  validateConfig(result.filepath, config)

  return {
    config,
    filepath: result.filepath
  }
}

const normalizeExtendedConfigurationName = (name: string): string => {
  if (/^@[^/]+$/u.test(name)) {
    return `${name}/commitlint-config`
  }

  if (
    name.startsWith('.') ||
    isAbsolute(name) ||
    name.startsWith('@') ||
    name.startsWith('commitlint-config-')
  ) {
    return name
  }

  return `commitlint-config-${name}`
}

const getConditionalExport = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value

  if (!isRecord(value)) return undefined

  for (const condition of ['import', 'module', 'node', 'default']) {
    const resolved = getConditionalExport(value[condition])

    if (resolved !== undefined) return resolved
  }

  return undefined
}

const getPackageParts = (
  specifier: string
): { name: string, subpath: string } => {
  const segments = specifier.split('/')

  const name = specifier.startsWith('@') ?
    segments.slice(0, 2).join('/') :
    segments[0] ?? specifier

  return {
    name,
    subpath: specifier.slice(name.length).replace(/^\//u, '')
  }
}

const getPackageExport = (
  manifest: Record<string, unknown>,
  subpath: string
): unknown => {
  if (subpath.length === 0) {
    return isRecord(manifest.exports) && '.' in manifest.exports ?
      manifest.exports['.'] :
      manifest.exports
  }

  return isRecord(manifest.exports) ?
    manifest.exports[`./${subpath}`] :
    undefined
}

const getPackageFallback = (
  manifest: Record<string, unknown>
): string => {
  if (typeof manifest.module === 'string') return manifest.module

  return typeof manifest.main === 'string' ? manifest.main : 'index.js'
}

const resolvePackageEntry = (
  manifestPath: string,
  packageDirectory: string,
  subpath: string
): string | undefined => {
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))

  if (!isRecord(parsed)) return undefined

  const exportedPath = getConditionalExport(
    getPackageExport(parsed, subpath)
  )

  const resolved = join(
    packageDirectory, exportedPath ?? getPackageFallback(parsed)
  )

  return existsSync(resolved) ? resolved : undefined
}

const resolveEsmPackage = (
  specifier: string,
  cwd: string
): string | undefined => {
  if (
    specifier.startsWith('.') ||
    isAbsolute(specifier)
  ) {
    return undefined
  }

  const { name, subpath } = getPackageParts(specifier)
  let directory = cwd

  for (;;) {
    const packageDirectory = join(directory, 'node_modules', name)
    const manifestPath = join(packageDirectory, 'package.json')

    if (existsSync(manifestPath)) {
      return resolvePackageEntry(manifestPath, packageDirectory, subpath)
    }

    const parent = dirname(directory)

    if (parent === directory) return undefined

    directory = parent
  }
}

const resolveModule = (
  specifier: string,
  cwd: string
): string => {
  const parent = join(cwd, 'package.json')
  const localRequire = createRequire(parent)

  try {
    return localRequire.resolve(specifier)
  } catch (requireError) {
    const esmPackage = resolveEsmPackage(specifier, cwd)

    if (esmPackage !== undefined) return esmPackage

    try {
      const resolved = import.meta.resolve(
        specifier, pathToFileURL(parent).href
      )

      return resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved
    } catch {
      throw requireError
    }
  }
}

const importModule = async (
  specifier: string,
  cwd: string
): Promise<unknown> => {
  const resolved = resolveModule(specifier, cwd)

  const imported: unknown = await import(
    isAbsolute(resolved) ? pathToFileURL(resolved).href : resolved
  )

  return unwrapDefault(imported)
}

const loadConfiguredParserPreset = async (
  parserPreset: UserConfig['parserPreset'],
  cwd: string
): Promise<UserConfig['parserPreset']> => {
  if (typeof parserPreset !== 'string') return parserPreset

  const resolved = resolveModule(parserPreset, cwd)
  const parserOptions = await importModule(parserPreset, cwd)

  return {
    name: parserPreset,
    parserOpts: parserOptions,
    path: resolved
  }
}

const mergeRecords = (
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> => {
  const merged = { ...base }

  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key]

    if (
      key === 'plugins' &&
      isUnknownArray(existing) &&
      isUnknownArray(value)
    ) {
      merged[key] = [...existing, ...value]
    } else if (isRecord(existing) && isRecord(value)) {
      merged[key] = mergeRecords(existing, value)
    } else {
      merged[key] = value
    }
  }

  return merged
}

const mergeConfigurations = (
  base: UserConfig,
  override: UserConfig,
  source: string
): UserConfig => {
  const merged = mergeRecords(base, override)

  validateConfig(source, merged)

  return merged
}

const normalizeExtends = (
  value: UserConfig['extends']
): string[] => {
  if (Array.isArray(value)) return value

  return typeof value === 'string' ? [value] : []
}

const applyParserPreset = (
  configuration: UserConfig,
  parserPreset: UserConfig['parserPreset']
): UserConfig => parserPreset === undefined ?
  configuration :
  {
    ...configuration,
    parserPreset
  }

const resolveConfigurationExtends = async (
  configuration: UserConfig,
  cwd: string,
  pluginDirectories: Map<string, string>,
  ancestors = new Set<string>()
): Promise<UserConfig> => {
  let merged: UserConfig = {}

  for (const name of normalizeExtends(configuration.extends)) {
    const normalized = normalizeExtendedConfigurationName(name)
    const resolved = resolveModule(normalized, cwd)

    if (ancestors.has(resolved)) {
      throw new Error(`Circular Commitlint configuration extends: ${name}`)
    }

    const value = await resolveConfiguration(
      await importModule(normalized, cwd)
    )

    validateConfig(resolved, value)

    const nextAncestors = new Set(ancestors)

    nextAncestors.add(resolved)

    const parserPreset = await loadConfiguredParserPreset(
      value.parserPreset, dirname(resolved)
    )

    const extended = await resolveConfigurationExtends(
      applyParserPreset(value, parserPreset), dirname(resolved), pluginDirectories, nextAncestors
    )

    merged = mergeConfigurations(merged, extended, resolved)
  }

  for (const plugin of configuration.plugins ?? []) {
    if (typeof plugin === 'string') pluginDirectories.set(plugin, cwd)
  }

  return mergeConfigurations(merged, configuration, 'commitlint configuration')
}

const normalizePluginName = (name: string): string => {
  if (name.startsWith('@')) {
    const [scope, packageName] = name.split('/')

    if (scope === undefined) return name

    if (packageName === undefined || packageName.length === 0) {
      return `${scope}/commitlint-plugin`
    }

    return packageName.startsWith('commitlint-plugin-') ?
      name :
      `${scope}/commitlint-plugin-${packageName}`
  }

  return name.startsWith('commitlint-plugin-') ?
    name :
    `commitlint-plugin-${name}`
}

const getPluginKey = (name: string): string => {
  const normalized = normalizePluginName(name)

  if (normalized.startsWith('@')) {
    return normalized
      .replace('/commitlint-plugin-', '/')
      .replace('/commitlint-plugin', '')
  }

  return normalized.replace(/^commitlint-plugin-/u, '')
}

const isPlugin = (value: unknown): value is Plugin => isRecord(value) && isRecord(value.rules)

const importPlugin = async (
  name: string,
  cwd: string
): Promise<Plugin> => {
  if (/\s/u.test(name)) {
    throw new Error(`Whitespace found in Commitlint plugin name: ${name}`)
  }

  const normalized = normalizePluginName(name)
  const plugin = await importModule(normalized, cwd)

  if (!isPlugin(plugin)) {
    throw new TypeError(`Commitlint plugin did not export rules: ${normalized}`)
  }

  return plugin
}

const loadPlugins = async (
  configured: UserConfig['plugins'],
  cwd: string,
  pluginDirectories: ReadonlyMap<string, string>
): Promise<PluginRecords> => {
  const plugins: PluginRecords = {}

  for (const plugin of configured ?? []) {
    if (typeof plugin === 'string') {
      const key = getPluginKey(plugin)

      plugins[key] ??= await importPlugin(
        plugin, pluginDirectories.get(plugin) ?? cwd
      )
    } else {
      plugins.local = plugin
    }
  }

  return plugins
}

const executeRules = async (
  configured: UserConfig['rules']
): Promise<QualifiedRules> => {
  const executed = await Promise.all(
    Object.entries(configured ?? {}).map(entry => executeRule(entry))
  )

  const rules: QualifiedRules = {}

  for (const rule of executed) {
    if (rule === null) continue

    const [name, configuration] = rule

    rules[name] = configuration
  }

  return rules
}

const executeParserFactory = async (
  factory: ParserFactory
): Promise<unknown> => await new Promise((resolve, reject) => {
  const callback = (
    error: unknown,
    result?: ParserFactoryResult
  ): void => {
    if (error) {
      reject(toError(error))

      return
    }

    resolve(result?.parserOpts)
  }

  try {
    const result = factory(callback)

    if (result !== undefined) {
      Promise.resolve(result)
        .then(value => value.parserOpts ?? value.parser)
        .then(resolve)
        .catch((error: unknown) => {
          reject(toError(error))

          return undefined
        })
    }
  } catch (error) {
    reject(toError(error))
  }
})

const loadParserOptions = async (
  pending: UserConfig['parserPreset']
): Promise<ParserPreset | undefined> => {
  const parserPreset = await pending

  if (!isRecord(parserPreset)) return undefined

  let parserOptions = await parserPreset.parserOpts

  if (
    typeof parserPreset.name === 'string' &&
    parserPreset.name.startsWith('conventional-changelog-') &&
    isParserFactory(parserOptions)
  ) {
    parserOptions = await executeParserFactory(parserOptions)
  }

  if (
    isRecord(parserOptions) &&
    isRecord(parserOptions.parserOpts)
  ) {
    const { parserOpts, ...overrides } = parserOptions

    return {
      ...parserPreset,
      parserOpts: {
        ...parserOpts,
        ...overrides
      }
    }
  }

  return {
    ...parserPreset,
    parserOpts: parserOptions
  }
}

const getPrompt = (
  prompt: UserConfig['prompt']
): UserPromptConfig => prompt ?? {}

export const loadCommitlintConfiguration = async (
  cwd: string
): Promise<QualifiedConfig> => {
  const loaded = await loadRepositoryConfiguration(cwd)

  const baseDirectory = loaded.filepath === undefined ?
    cwd :
    dirname(loaded.filepath)

  const parserPreset = await loadConfiguredParserPreset(
    loaded.config.parserPreset, baseDirectory
  )

  const pluginDirectories = new Map<string, string>()

  const extended = await resolveConfigurationExtends(
    applyParserPreset({
      extends: [],
      plugins: [],
      rules: {},
      ...loaded.config
    }, parserPreset), baseDirectory, pluginDirectories
  )

  return {
    defaultIgnores: extended.defaultIgnores,
    extends: normalizeExtends(extended.extends),
    formatter: extended.formatter ?? DEFAULT_FORMATTER,
    helpUrl: extended.helpUrl ?? DEFAULT_HELP_URL,
    ignores: extended.ignores,
    parserPreset: await loadParserOptions(extended.parserPreset),
    plugins: await loadPlugins(
      extended.plugins, baseDirectory, pluginDirectories
    ),
    prompt: getPrompt(extended.prompt),
    rules: await executeRules(extended.rules)
  }
}

export const configurationInternals = {
  applyParserPreset,
  executeParserFactory,
  getConditionalExport,
  getPackageExport,
  getPackageFallback,
  getPackageParts,
  getPluginKey,
  loadParserOptions,
  mergeRecords,
  normalizeExtendedConfigurationName,
  normalizeExtends,
  normalizePluginName,
  resolveEsmPackage,
  resolvePackageEntry,
  unwrapDefault
}
