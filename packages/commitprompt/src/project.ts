import {
  access,
  chmod,
  readFile
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type Document, isAlias, isMap, isScalar, isSeq, type Pair, parseDocument, Scalar, type YAMLMap, type YAMLSeq } from 'yaml'

import {
  AGENT_SKILL_TEMPLATE,
  INSTRUCTION_END_MARKER,
  INSTRUCTION_START_MARKER,
  PROJECT_INSTRUCTION_SECTION
} from './instructions.js'
import { writeSettings } from './settings.js'

const PACKAGE_NAME = '@santi020k/commitprompt'
const COMMIT_SCRIPT = 'commitprompt'
const HUSKY_VERSION = '^9.1.7'
const HOOK_COMMAND = 'commitprompt validate --input "$1"'
const HOOK_START_MARKER = '# commitprompt:start'
const HOOK_END_MARKER = '# commitprompt:end'
const HOOK_SECTION = `${HOOK_START_MARKER}\n${HOOK_COMMAND}\n${HOOK_END_MARKER}`
const HOOK_STEP_NAME = 'Validate commit message with Commitprompt'

const DEFAULT_ACTIONS: readonly ProjectSetupActionId[] = [
  'dependency',
  'commit-script',
  'husky-hook',
  'agents-instructions',
  'copilot-instructions',
  'agent-skill',
  'claude-skill'
]

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export type ProjectSetupActionId =
  | 'agent-skill' |
  'agents-instructions' |
  'claude-skill' |
  'commit-script' |
  'copilot-instructions' |
  'dependency' |
  'husky-hook' |
  'quality-hook'

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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const assertPackageManifest: (
  value: Record<string, unknown>,
  path: string
) => asserts value is PackageManifest = (value, path) => {
  for (const field of ['dependencies', 'devDependencies', 'scripts']) {
    const entry = value[field]

    if (entry === undefined) continue

    if (!isRecord(entry) || Object.values(entry).some(item => typeof item !== 'string')) {
      throw new TypeError(`Invalid package manifest field "${field}": expected an object of strings: ${path}`)
    }
  }

  if (value.packageManager !== undefined && typeof value.packageManager !== 'string') {
    throw new TypeError(`Invalid package manifest field "packageManager": expected a string: ${path}`)
  }

  if (value.config !== undefined && !isRecord(value.config)) {
    throw new TypeError(`Invalid package manifest field "config": expected an object: ${path}`)
  }
}

const parseManifest = (source: string, path: string): PackageManifest => {
  let value: unknown

  try {
    value = JSON.parse(source)
  } catch {
    throw new Error(`Cannot update invalid package manifest: ${path}`)
  }

  if (!isRecord(value)) {
    throw new TypeError(`Package manifest must contain an object: ${path}`)
  }

  assertPackageManifest(value, path)

  return value
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
  const newline = originalSource.includes('\r\n') ? '\r\n' : '\n'

  const formatted = JSON.stringify(manifest, undefined, getIndent(originalSource))
    .replaceAll('\n', newline)

  return originalSource.endsWith('\n') ? `${formatted}${newline}` : formatted
}

const getUpdatedManifestSource = (
  manifest: PackageManifest,
  originalSource: string,
  changed: boolean
): string => changed ? formatManifest(manifest, originalSource) : originalSource

const setDependency = (
  manifest: PackageManifest,
  name: string,
  version: string
): boolean => {
  const developmentVersion = manifest.devDependencies?.[name]

  if (developmentVersion !== undefined) return false

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

const hasRepeatedMarker = (
  source: string,
  marker: string
): boolean => source.indexOf(marker) !== source.lastIndexOf(marker)

const replaceGuardedSection = (
  source: string | undefined,
  section: string,
  startMarker: string,
  endMarker: string
): string => {
  if (source === undefined || source.trim().length === 0) return `${section}\n`

  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)

  if (
    (start === -1) !== (end === -1) ||
    end < start ||
    hasRepeatedMarker(source, startMarker) ||
    hasRepeatedMarker(source, endMarker)
  ) {
    throw new Error(`Cannot update an incomplete guarded section: ${startMarker}`)
  }

  if (start !== -1 && end !== -1) {
    const afterEnd = end + endMarker.length

    return `${source.slice(0, start)}${section}${source.slice(afterEnd)}`
  }

  return `${source.trimEnd()}\n\n${section}\n`
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

const insertCatalogEntry = (
  source: string,
  range: readonly [number, number, number],
  specifier: string,
  flow: boolean,
  empty: boolean
): string => {
  const entry = `"${PACKAGE_NAME}": ${specifier}`

  if (flow) {
    const position = range[0] + 1
    const separator = empty ? '' : ', '

    return `${source.slice(0, position)}${entry}${separator}${source.slice(position)}`
  }

  const position = empty ? range[2] : source.lastIndexOf('\n', range[0] - 1) + 1
  const indentation = empty ? '  ' : source.slice(position, range[0])
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const leadingNewline = position > 0 && source[position - 1] !== '\n' ? newline : ''

  return `${source.slice(0, position)}${leadingNewline}${indentation}${entry}${newline}${source.slice(position)}`
}

const assertCatalogEntries = (entries: Pair[], path: string): void => {
  for (const { key, value } of entries) {
    if (!isScalar(key) || typeof key.value !== 'string' ||
      !isScalar(value) || typeof value.value !== 'string') {
      throw new Error(`Invalid pnpm catalog: expected dependency names and versions as strings: ${path}`)
    }
  }
}

const isEmptyCatalog = (catalog: unknown): catalog is Scalar<null> => isScalar(catalog) && catalog.value === null &&
  catalog.range?.[0] === catalog.range?.[1]

const readPnpmCatalog = (source: string, path: string): YAMLMap | Scalar<null> | undefined => {
  const document = parseDocument(source)

  if (document.errors.length > 0 || !isMap(document.contents)) {
    throw new Error(`Cannot update invalid pnpm workspace configuration: ${path}`)
  }

  const catalog = document.get('catalog', true)

  if (catalog === undefined) return undefined

  if (isAlias(catalog)) {
    const resolved = catalog.resolve(document)

    if (isMap(resolved) && resolved.has(PACKAGE_NAME)) {
      assertCatalogEntries(resolved.items, path)

      return resolved
    }

    throw new Error(`Cannot repair an aliased pnpm catalog; define a separate default catalog: ${path}`)
  }

  if (isMap(catalog)) {
    assertCatalogEntries(catalog.items, path)

    return catalog
  }

  if (isEmptyCatalog(catalog)) return catalog

  throw new Error(`Invalid pnpm catalog: expected a dependency mapping: ${path}`)
}

const analyzePnpmCatalog = (
  source: string,
  path: string,
  specifier: string
): PnpmCatalogConfiguration => {
  const catalog = readPnpmCatalog(source, path)

  if (catalog === undefined) return { specifier }

  if (isMap(catalog) && catalog.has(PACKAGE_NAME)) return { specifier: 'catalog:' }

  if (catalog.anchor !== undefined) {
    throw new Error(`Cannot repair an anchored pnpm catalog; define a separate default catalog: ${path}`)
  }

  if (catalog.range === undefined || catalog.range === null) {
    throw new Error(`Cannot locate pnpm catalog in workspace configuration: ${path}`)
  }

  const flow = isMap(catalog) && catalog.flow === true
  const empty = isMap(catalog) ? catalog.items.length === 0 : true

  return {
    path,
    source: insertCatalogEntry(source, catalog.range, specifier, flow, empty),
    specifier: 'catalog:'
  }
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

  return analyzePnpmCatalog(source, workspacePath, defaultSpecifier)
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

interface DesiredHookStep {
  args: string[]
  command: string
  name: string
  pass_hook_args: boolean
}

const normalizeHookStepName = (value: unknown): string | undefined => typeof value === 'string' ? value.trim() : undefined

const findExistingStepIndex = (
  steps: YAMLSeq,
  name: string
): number => {
  let existingIndex = -1

  for (const [index, item] of steps.items.entries()) {
    if (!isMap(item) || normalizeHookStepName(item.get('name')) !== name) continue

    if (existingIndex !== -1) {
      throw new Error('Cannot update duplicate managed Quality hook steps; keep one Commitprompt validation step.')
    }

    existingIndex = index
  }

  return existingIndex
}

const stepArgsMatch = (
  existingArgs: unknown,
  desiredArgs: readonly string[]
): boolean => {
  if (!isSeq(existingArgs)) return false

  const values = existingArgs.items.map(item => isScalar(item) ? item.value : undefined)

  return values.length === desiredArgs.length &&
    values.every((value, index) => value === desiredArgs[index])
}

const updateExistingStep = (
  step: YAMLMap,
  desiredStep: DesiredHookStep
): boolean => {
  let mutated = false

  if (step.get('command') !== desiredStep.command) {
    step.set('command', desiredStep.command)

    mutated = true
  }

  const existingArgs = step.get('args', true)

  if (!stepArgsMatch(existingArgs, desiredStep.args)) {
    if (isSeq(existingArgs)) {
      existingArgs.items = desiredStep.args.map(argument => new Scalar(argument))
    } else {
      step.set('args', desiredStep.args)
    }

    mutated = true
  }

  if (step.get('pass_hook_args') !== desiredStep.pass_hook_args) {
    step.set('pass_hook_args', desiredStep.pass_hook_args)

    mutated = true
  }

  return mutated
}

const assertHookNodeShape = (
  node: unknown,
  isValid: (value: unknown) => boolean,
  hookPath: string
): void => {
  if (node !== undefined && !isValid(node)) {
    throw new Error(`Cannot update invalid quality configuration: ${hookPath}`)
  }
}

const getHookSteps = (
  document: Document.Parsed,
  hookPath: string
): YAMLSeq | undefined => {
  if (document.errors.length > 0 ||
    (document.contents !== null && !isMap(document.contents))) {
    throw new Error(`Cannot update invalid quality configuration: ${hookPath}`)
  }

  const hooksNode = document.get('hooks', true)

  assertHookNodeShape(hooksNode, isMap, hookPath)

  const commitMsgNode = isMap(hooksNode) ? hooksNode.get('commit-msg', true) : undefined

  assertHookNodeShape(commitMsgNode, isMap, hookPath)

  const steps = isMap(commitMsgNode) ? commitMsgNode.get('steps', true) : undefined

  assertHookNodeShape(steps, isSeq, hookPath)

  return isSeq(steps) ? steps : undefined
}

const configureHookSteps = (
  document: Document.Parsed,
  steps: YAMLSeq | undefined,
  desiredStep: DesiredHookStep
): boolean => {
  if (steps === undefined) {
    document.setIn(['hooks', 'commit-msg', 'steps'], [desiredStep])

    return true
  }

  const existingIndex = findExistingStepIndex(steps, HOOK_STEP_NAME)

  if (existingIndex === -1) {
    steps.add(desiredStep)

    return true
  }

  const existingStep = steps.get(existingIndex, true)

  return isMap(existingStep) && updateExistingStep(existingStep, desiredStep)
}

const NPM_HOOK_SCRIPT = [
  'import { readFile } from \'node:fs/promises\'',
  'import { runAutomation } from \'@santi020k/commitprompt\'',
  'process.exitCode = await runAutomation({ command: \'validate\', cwd: process.cwd(), input: await readFile(process.argv[1], \'utf8\'), log: console.log, error: console.error })'
].join('; ')

const createDesiredHookStep = (packageManager: PackageManager): DesiredHookStep => ({
  args: packageManager === 'npm' ?
    ['--input-type=module', '--eval', NPM_HOOK_SCRIPT, '--'] :
    [packageManager === 'yarn' ? 'run' : 'exec', 'commitprompt', 'validate', '--input'],
  command: packageManager === 'npm' ? 'node' : packageManager,
  name: HOOK_STEP_NAME,
  pass_hook_args: true
})

const seedQualityVersion = (document: Document.Parsed): boolean => {
  if (document.has('version')) return false

  document.set('version', 1)

  return true
}

const analyzeHook = async (
  cwd: string,
  packageManager: PackageManager,
  selectedActions: ReadonlySet<ProjectSetupActionId>
): Promise<HookConfiguration> => {
  if (!selectedActions.has('quality-hook')) return {}

  const hookPath = join(cwd, 'quality.yml')
  const originalHook = await readOptionalFile(hookPath)
  const document = parseDocument(originalHook ?? 'version: 1\n')
  const steps = getHookSteps(document, hookPath)
  const versionMissing = seedQualityVersion(document)
  const desiredStep = createDesiredHookStep(packageManager)
  const mutated = configureHookSteps(document, steps, desiredStep) || versionMissing
  const serializedHook = mutated ? document.toString() : originalHook ?? 'version: 1\n'

  const updatedHook = mutated && originalHook?.includes('\r\n') ?
    serializedHook.replaceAll('\n', '\r\n') :
    serializedHook

  const changed = updatedHook !== originalHook

  const action: ProjectSetupAction = {
    changed,
    id: 'quality-hook',
    path: hookPath
  }

  if (!changed) return { action }

  return {
    action,
    file: {
      path: hookPath,
      source: updatedHook
    }
  }
}

const analyzeHuskyHook = async (
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

const reportCatalogChange = (
  actions: ProjectSetupAction[],
  configuration: PnpmCatalogConfiguration
): void => {
  if (configuration.source === undefined || configuration.path === undefined) return

  const dependencyAction = actions.find(action => action.id === 'dependency')

  if (dependencyAction === undefined) return

  if (!dependencyAction.changed) dependencyAction.path = configuration.path

  dependencyAction.changed = true
}

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

  const manifestChanged = manifestConfiguration.hookChanged ||
    manifestConfiguration.actions.some(action => action.changed)

  reportCatalogChange(manifestConfiguration.actions, catalogConfiguration)

  const instructionConfiguration =
    await analyzeInstructionFiles(cwd, selectedActions)

  const hookConfiguration = await analyzeHook(
    cwd, packageManager, selectedActions
  )

  const huskyHookConfiguration = await analyzeHuskyHook(
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

  appendHookConfiguration(actions, pendingFiles, huskyHookConfiguration)

  actions.push(...instructionConfiguration.actions)

  const updatedManifestSource = getUpdatedManifestSource(
    manifest, originalManifestSource, manifestChanged
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
