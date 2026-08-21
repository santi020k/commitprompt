import {
  access,
  chmod,
  readFile
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AGENT_SKILL_TEMPLATE,
  INSTRUCTION_END_MARKER,
  INSTRUCTION_START_MARKER,
  PROJECT_INSTRUCTION_SECTION
} from './instructions.js'
import { writeSettings } from './settings.js'

const PACKAGE_NAME = '@santi020k/commitprompt'
const HUSKY_VERSION = '^9.1.7'
const COMMIT_SCRIPT = 'commitprompt'
const HOOK_COMMAND = 'commitprompt validate --input "$1"'
const HOOK_START_MARKER = '# commitprompt:start'
const HOOK_END_MARKER = '# commitprompt:end'

const DEFAULT_ACTIONS: readonly ProjectSetupActionId[] = [
  'dependency',
  'commit-script',
  'husky-hook',
  'agents-instructions',
  'copilot-instructions',
  'agent-skill',
  'claude-skill'
]

const HOOK_SECTION = `${HOOK_START_MARKER}
${HOOK_COMMAND}
${HOOK_END_MARKER}`

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export type ProjectSetupActionId =
  | 'agent-skill' |
  'agents-instructions' |
  'claude-skill' |
  'commit-script' |
  'copilot-instructions' |
  'dependency' |
  'husky-hook'

export interface ProjectSetupAction {
  changed: boolean
  id: ProjectSetupActionId
  path: string
}

export interface ProjectSetupOptions {
  actions?: readonly ProjectSetupActionId[]
  check?: boolean
  cwd: string
  dryRun?: boolean
  packageVersion?: string
}

export interface ProjectSetupResult {
  actions: ProjectSetupAction[]
  changed: boolean
  drift: boolean
  obsolete: string[]
  packageManager: PackageManager
}

interface PackageManifest {
  config?: {
    commitizen?: unknown
    [key: string]: unknown
  }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  packageManager?: string
  scripts?: Record<string, string>
  [key: string]: unknown
}

interface PendingFile {
  executable?: boolean
  path: string
  source: string
}

interface ManifestConfiguration {
  actions: ProjectSetupAction[]
  hookChanged: boolean
}

interface PnpmCatalogConfiguration {
  path?: string
  source?: string
  specifier: string
}

interface CatalogRange {
  source: string
  start: number
}

interface HookConfiguration {
  action?: ProjectSetupAction
  file?: PendingFile
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)

    return true
  } catch {
    return false
  }
}

const readOptionalFile = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined
    }

    throw error
  }
}

const parseManifest = (source: string, path: string): PackageManifest => {
  let value: unknown

  try {
    value = JSON.parse(source)
  } catch {
    throw new Error(`Cannot update invalid package manifest: ${path}`)
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Package manifest must contain an object: ${path}`)
  }

  return value as PackageManifest
}

const detectPackageManager = async (
  cwd: string,
  manifest: PackageManifest
): Promise<PackageManager> => {
  const declaredManager = manifest.packageManager?.split('@')[0]

  if (
    declaredManager === 'npm' ||
    declaredManager === 'pnpm' ||
    declaredManager === 'yarn'
  ) {
    return declaredManager
  }

  const lockfiles = await Promise.all([
    fileExists(join(cwd, 'pnpm-lock.yaml')),
    fileExists(join(cwd, 'yarn.lock')),
    fileExists(join(cwd, 'package-lock.json')),
    fileExists(join(cwd, 'npm-shrinkwrap.json'))
  ])

  if (lockfiles[0]) return 'pnpm'

  if (lockfiles[1]) return 'yarn'

  return 'npm'
}

const getIndent = (source: string): string => {
  const match = /^[\t ]+(?=")/m.exec(source)

  return match?.[0] ?? '  '
}

const formatManifest = (
  manifest: PackageManifest,
  originalSource: string
): string => {
  const formatted = JSON.stringify(manifest, undefined, getIndent(originalSource))

  return originalSource.endsWith('\n') ? `${formatted}\n` : formatted
}

const setDependency = (
  manifest: PackageManifest,
  name: string,
  version: string,
  updateExisting = false
): boolean => {
  const developmentVersion = manifest.devDependencies?.[name]

  if (developmentVersion !== undefined) {
    if (!updateExisting || developmentVersion === version) return false

    manifest.devDependencies = {
      ...manifest.devDependencies,
      [name]: version
    }

    return true
  }

  const existingVersion = manifest.dependencies?.[name]

  manifest.devDependencies = {
    ...manifest.devDependencies,
    [name]: existingVersion ?? version
  }

  if (manifest.dependencies !== undefined && existingVersion !== undefined) {
    const { [name]: _removed, ...dependencies } = manifest.dependencies

    manifest.dependencies = dependencies
  }

  return true
}

const setScript = (
  manifest: PackageManifest,
  name: string,
  command: string
): boolean => {
  if (manifest.scripts?.[name] === command) return false

  manifest.scripts = {
    ...manifest.scripts,
    [name]: command
  }

  return true
}

const ensurePrepareScript = (manifest: PackageManifest): boolean => {
  const existing = manifest.scripts?.prepare

  if (existing !== undefined) {
    const updated = existing.replace(
      /(^|&&)(\s*)husky install(?=\s*(?:&&|$))/gu, '$1$2husky'
    )

    if (updated !== existing) return setScript(manifest, 'prepare', updated)

    if (/(^|&&)\s*husky(?:\s|$)/u.test(existing)) return false
  }

  return setScript(
    manifest, 'prepare', existing === undefined ? 'husky' : `${existing} && husky`
  )
}

const replaceGuardedSection = (
  source: string | undefined,
  section: string,
  startMarker: string,
  endMarker: string
): string => {
  if (source === undefined || source.trim().length === 0) return `${section}\n`

  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)

  if ((start === -1) !== (end === -1)) {
    throw new Error(`Cannot update an incomplete guarded section: ${startMarker}`)
  }

  if (start !== -1 && end !== -1) {
    const afterEnd = end + endMarker.length

    return `${source.slice(0, start)}${section}${source.slice(afterEnd)}`
  }

  return `${source.trimEnd()}\n\n${section}\n`
}

const KNOWN_COMMITLINT_INVOCATION =
  /(?:(?:pnpm\s+exec|npx|yarn)\s+)?commitlint\s+--edit\s+(?:"\$1"|'\$1'|\$1)/gu

const updateHook = (source: string | undefined): string => {
  // Replace only the obsolete validator command. Using `true` preserves any
  // surrounding `&&`, `if`, or multiline shell structure in an existing hook.
  const withoutKnownValidator = source?.replace(KNOWN_COMMITLINT_INVOCATION, 'true')

  return replaceGuardedSection(
    withoutKnownValidator, HOOK_SECTION, HOOK_START_MARKER, HOOK_END_MARKER
  )
}

const isObsoleteDependency = (name: string): boolean => name === 'commitizen' ||
  name === 'czg' ||
  name.startsWith('cz-') ||
  name.startsWith('@commitlint/prompt')

const isObsoleteScript = (command: string): boolean => command.includes('commitizen') ||
  command.includes('git-cz') ||
  /(^|\s)czg(\s|$)/u.test(command)

const findObsoleteConfiguration = (manifest: PackageManifest): string[] => {
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies
  }

  const obsolete: string[] = []

  for (const name of Object.keys(dependencies)) {
    if (isObsoleteDependency(name)) obsolete.push(`dependency:${name}`)
  }

  if (manifest.config?.commitizen !== undefined) {
    obsolete.push('package.json:config.commitizen')
  }

  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    if (isObsoleteScript(command)) {
      obsolete.push(`package.json:scripts.${name}`)
    }
  }

  return obsolete.sort()
}

const getInstalledPackageVersion = async (): Promise<string> => {
  const candidates = [
    new URL('../../package.json', import.meta.url),
    new URL('../package.json', import.meta.url)
  ]

  for (const candidate of candidates) {
    const candidatePath = fileURLToPath(candidate)
    const source = await readOptionalFile(candidatePath)

    if (source === undefined) continue

    const metadata = parseManifest(source, candidatePath)
    const version = metadata.version

    if (typeof version === 'string') return version
  }

  throw new Error('Could not determine the installed Commitprompt version.')
}

const shouldConfigurePnpmCatalog = (
  manifest: PackageManifest,
  packageManager: PackageManager
): boolean => {
  const existingSpecifier =
    manifest.devDependencies?.[PACKAGE_NAME] ??
    manifest.dependencies?.[PACKAGE_NAME]

  return packageManager === 'pnpm' &&
    (
      existingSpecifier === undefined ||
      existingSpecifier === 'catalog:'
    )
}

const getCatalogRange = (source: string): CatalogRange | undefined => {
  const header = /^catalog:\s*(?:#.*)?$/mu.exec(source)

  if (header === null) return undefined

  const start = header.index + header[0].length
  const remaining = source.slice(start)
  const nextTopLevel = /^\S.*$/mu.exec(remaining.slice(1))

  const end = nextTopLevel?.index === undefined ?
    source.length :
    start + 1 + nextTopLevel.index

  return {
    source: source.slice(start, end),
    start
  }
}

const catalogContainsPackage = (catalogSource: string): boolean => {
  const escapedName = PACKAGE_NAME.replaceAll('/', String.raw`\/`)

  const packagePattern = new RegExp(
    String.raw`^\s*["']?${escapedName}["']?\s*:`, 'mu'
  )

  return packagePattern.test(catalogSource)
}

const configurePnpmCatalog = async (
  cwd: string,
  manifest: PackageManifest,
  packageManager: PackageManager,
  version: string
): Promise<PnpmCatalogConfiguration> => {
  const defaultSpecifier = `^${version}`

  if (!shouldConfigurePnpmCatalog(manifest, packageManager)) {
    return { specifier: defaultSpecifier }
  }

  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const source = await readOptionalFile(workspacePath)

  if (source === undefined) return { specifier: defaultSpecifier }

  const catalog = getCatalogRange(source)

  if (catalog === undefined) return { specifier: defaultSpecifier }

  if (catalogContainsPackage(catalog.source)) return { specifier: 'catalog:' }

  const indentation = /^([ \t]+)\S/mu.exec(catalog.source)?.[1] ?? '  '
  const entry = `\n${indentation}"${PACKAGE_NAME}": ${defaultSpecifier}`

  const updatedSource =
    `${source.slice(0, catalog.start)}${entry}${source.slice(catalog.start)}`

  return {
    path: workspacePath,
    source: updatedSource,
    specifier: 'catalog:'
  }
}

const configureManifest = (
  manifest: PackageManifest,
  dependencySpecifier: string,
  manifestPath: string,
  selectedActions: ReadonlySet<ProjectSetupActionId>
): ManifestConfiguration => {
  const actions: ProjectSetupAction[] = []

  if (selectedActions.has('dependency')) {
    const dependencyChanged = setDependency(
      manifest, PACKAGE_NAME, dependencySpecifier
    )

    actions.push({
      changed: dependencyChanged,
      id: 'dependency',
      path: manifestPath
    })
  }

  if (selectedActions.has('commit-script')) {
    const commitScriptChanged = setScript(manifest, 'commit', COMMIT_SCRIPT)

    actions.push({
      changed: commitScriptChanged,
      id: 'commit-script',
      path: manifestPath
    })
  }

  if (selectedActions.has('husky-hook')) {
    const huskyDependencyChanged =
      setDependency(manifest, 'husky', HUSKY_VERSION)

    const prepareScriptChanged = ensurePrepareScript(manifest)

    return {
      actions,
      hookChanged: huskyDependencyChanged || prepareScriptChanged
    }
  }

  return { actions, hookChanged: false }
}

const analyzeInstructionFiles = async (
  cwd: string,
  selectedActions: ReadonlySet<ProjectSetupActionId>
): Promise<{
  actions: ProjectSetupAction[]
  files: PendingFile[]
}> => {
  const instructionTargets = [
    {
      id: 'agents-instructions' as const,
      path: join(cwd, 'AGENTS.md')
    },
    {
      id: 'copilot-instructions' as const,
      path: join(cwd, '.github', 'copilot-instructions.md')
    },
    {
      id: 'agent-skill' as const,
      path: join(cwd, '.agents', 'skills', 'commitprompt', 'SKILL.md'),
      skill: true
    },
    {
      id: 'claude-skill' as const,
      path: join(cwd, '.claude', 'skills', 'commitprompt', 'SKILL.md'),
      skill: true
    }
  ]

  const actions: ProjectSetupAction[] = []
  const pendingFiles: PendingFile[] = []

  for (const target of instructionTargets) {
    if (!selectedActions.has(target.id)) continue

    const original = await readOptionalFile(target.path)

    const updated = target.skill ?
      AGENT_SKILL_TEMPLATE :
      replaceGuardedSection(
        original, PROJECT_INSTRUCTION_SECTION, INSTRUCTION_START_MARKER, INSTRUCTION_END_MARKER
      )

    const changed = updated !== original

    actions.push({
      changed,
      id: target.id,
      path: target.path
    })

    if (changed) pendingFiles.push({ path: target.path, source: updated })
  }

  return { actions, files: pendingFiles }
}

const writeProjectFiles = async (
  manifestPath: string,
  originalManifestSource: string,
  updatedManifestSource: string,
  files: PendingFile[]
): Promise<void> => {
  if (updatedManifestSource !== originalManifestSource) {
    await writeSettings(manifestPath, updatedManifestSource)
  }

  for (const file of files) {
    await writeSettings(file.path, file.source)

    if (file.executable) await chmod(file.path, 0o755)
  }
}

const getSelectedActions = (
  selectedActionIds: readonly ProjectSetupActionId[] | undefined
): ReadonlySet<ProjectSetupActionId> => {
  const selectedActions = new Set(selectedActionIds ?? DEFAULT_ACTIONS)

  if (selectedActions.size === 0) {
    throw new Error('Project setup requires at least one action.')
  }

  return selectedActions
}

const analyzeHook = async (
  cwd: string,
  manifestChanged: boolean,
  selectedActions: ReadonlySet<ProjectSetupActionId>
): Promise<HookConfiguration> => {
  if (!selectedActions.has('husky-hook')) return {}

  const hookPath = join(cwd, '.husky', 'commit-msg')
  const originalHook = await readOptionalFile(hookPath)
  const updatedHook = updateHook(originalHook)
  const changed = manifestChanged || updatedHook !== originalHook

  const action: ProjectSetupAction = {
    changed,
    id: 'husky-hook',
    path: hookPath
  }

  if (updatedHook === originalHook) return { action }

  return {
    action,
    file: {
      executable: true,
      path: hookPath,
      source: updatedHook
    }
  }
}

const appendHookConfiguration = (
  actions: ProjectSetupAction[],
  files: PendingFile[],
  hook: HookConfiguration
): void => {
  if (hook.action !== undefined) actions.push(hook.action)

  if (hook.file !== undefined) files.push(hook.file)
}

const applyProjectSetup = async (
  shouldWrite: boolean,
  manifestPath: string,
  originalManifestSource: string,
  updatedManifestSource: string,
  files: PendingFile[]
): Promise<void> => {
  if (!shouldWrite) return

  await writeProjectFiles(
    manifestPath, originalManifestSource, updatedManifestSource, files
  )
}

const isAppliedChange = (
  check: boolean,
  dryRun: boolean,
  drift: boolean
): boolean => !check && !dryRun && drift

export const setupProject = async ({
  actions: selectedActionIds,
  check = false,
  cwd,
  dryRun = false,
  packageVersion
}: ProjectSetupOptions): Promise<ProjectSetupResult> => {
  const manifestPath = join(cwd, 'package.json')
  const originalManifestSource = await readFile(manifestPath, 'utf8')
  const originalManifest = parseManifest(originalManifestSource, manifestPath)
  const manifest = structuredClone(originalManifest)
  const packageManager = await detectPackageManager(cwd, manifest)
  const version = packageVersion ?? await getInstalledPackageVersion()
  const selectedActions = getSelectedActions(selectedActionIds)

  const catalogConfiguration = selectedActions.has('dependency') ?
    await configurePnpmCatalog(cwd, manifest, packageManager, version) :
    { specifier: `^${version}` }

  const manifestConfiguration = configureManifest(
    manifest, catalogConfiguration.specifier, manifestPath, selectedActions
  )

  if (catalogConfiguration.source !== undefined) {
    const dependencyAction = manifestConfiguration.actions.find(
      action => action.id === 'dependency'
    )

    if (dependencyAction) dependencyAction.changed = true
  }

  const instructionConfiguration =
    await analyzeInstructionFiles(cwd, selectedActions)

  const hookConfiguration = await analyzeHook(
    cwd, manifestConfiguration.hookChanged, selectedActions
  )

  const actions = [...manifestConfiguration.actions]
  const pendingFiles = [...instructionConfiguration.files]

  if (catalogConfiguration.path && catalogConfiguration.source) {
    pendingFiles.push({
      path: catalogConfiguration.path,
      source: catalogConfiguration.source
    })
  }

  appendHookConfiguration(actions, pendingFiles, hookConfiguration)

  actions.push(...instructionConfiguration.actions)

  const updatedManifestSource = formatManifest(
    manifest, originalManifestSource
  )

  await applyProjectSetup(
    !check && !dryRun, manifestPath, originalManifestSource, updatedManifestSource, pendingFiles
  )

  const drift = actions.some(action => action.changed)

  return {
    actions,
    changed: isAppliedChange(check, dryRun, drift),
    drift,
    obsolete: findObsoleteConfiguration(originalManifest),
    packageManager
  }
}
