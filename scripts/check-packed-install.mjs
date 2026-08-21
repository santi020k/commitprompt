import {
  execFileSync,
  spawn,
  spawnSync
} from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

import {
  getBinaryInvocation,
  getPnpmInvocation
} from './binary-invocation.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const packageDirectory = join(repositoryRoot, 'packages/commitprompt')
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'commitprompt-pack-'))

const executeBinarySync = (binary, arguments_, options) => {
  const invocation = getBinaryInvocation(binary, arguments_)

  return execFileSync(
    invocation.command,
    invocation.arguments_,
    {
      ...options,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    }
  )
}

const executePnpmSync = (arguments_, options) => {
  const invocation = getPnpmInvocation(arguments_)

  return executeBinarySync(invocation.command, invocation.arguments_, options)
}

const cleanPackageManagerEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^npm_(?:config|package)_/iu.test(key)
  )
)

const installPackage = packageManager => {
  const packageInvocation = packageManager.name === 'pnpm' ?
    getPnpmInvocation(packageManager.args) :
    {
      arguments_: packageManager.args,
      command: packageManager.command
    }

  const invocation = getBinaryInvocation(
    packageInvocation.command, packageInvocation.arguments_
  )

  const install = spawnSync(invocation.command, invocation.arguments_, {
    cwd: packageManager.consumerDirectory,
    encoding: 'utf8',
    env: packageManager.name === 'pnpm' ?
      process.env :
      cleanPackageManagerEnvironment,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments
  })

  const output = `${install.stdout}${install.stderr}`

  process.stdout.write(output)

  if (install.error !== undefined) throw install.error

  if (install.status !== 0) {
    throw new Error(
      `${packageManager.name} installation exited with ` +
      `${String(install.status)}.`
    )
  }

  if (/\b(?:warn|warning)\b/iu.test(output)) {
    throw new Error(
      `${packageManager.name} installation reported a warning:\n${output}`
    )
  }
}

const createLocalPackageSpecifier = () => {
  const packOutput = executePnpmSync(
    ['pack', '--json', '--pack-destination', temporaryDirectory],
    {
      cwd: packageDirectory,
      encoding: 'utf8'
    }
  )

  const packResult = JSON.parse(packOutput)

  const tarballName = Array.isArray(packResult) ?
    packResult[0]?.filename :
    packResult.filename

  if (!tarballName) {
    throw new Error('pnpm pack did not return a tarball filename.')
  }

  return isAbsolute(tarballName) ?
    tarballName :
    join(temporaryDirectory, tarballName)
}

const packageSpecifier = process.env.COMMITPROMPT_PACKAGE_SPEC ??
  createLocalPackageSpecifier()

const packageManagers = [
  {
    args: [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      packageSpecifier
    ],
    command: 'npm',
    name: 'npm'
  },
  {
    args: ['add', '--ignore-scripts', packageSpecifier],
    command: 'pnpm',
    name: 'pnpm'
  },
  {
    args: ['add', '--non-interactive', packageSpecifier],
    command: 'yarn',
    name: 'Yarn'
  }
]

const verifyInstalledCommands = (binary, consumerDirectory, name) => {
  const structuredInput = JSON.stringify({
    body: '',
    breaking: '',
    issues: '',
    scope: 'cli',
    subject: 'verify automation',
    type: 'feat'
  })

  const formatted = JSON.parse(executeBinarySync(
    binary,
    ['format', '--json'],
    {
      cwd: consumerDirectory,
      encoding: 'utf8',
      input: structuredInput
    }
  ))

  if (formatted.message !== 'feat(cli): verify automation') {
    throw new Error(`${name} returned unexpected structured output.`)
  }

  const instructions = JSON.parse(executeBinarySync(
    binary,
    ['instructions', '--json'],
    {
      cwd: consumerDirectory,
      encoding: 'utf8'
    }
  ))

  if (!instructions.instructions.includes('Use Conventional Commits')) {
    throw new Error(`${name} returned unexpected generation instructions.`)
  }

  const validation = JSON.parse(executeBinarySync(
    binary,
    ['validate', '--json'],
    {
      cwd: consumerDirectory,
      encoding: 'utf8',
      input: 'feat: verify installed validation'
    }
  ))

  if (validation.valid !== true) {
    throw new Error(`${name} rejected a valid installed message.`)
  }

  const projectPreview = JSON.parse(executeBinarySync(
    binary,
    ['setup', 'project', '--dry-run', '--json'],
    {
      cwd: consumerDirectory,
      encoding: 'utf8'
    }
  ))

  if (projectPreview.drift !== true || projectPreview.changed !== false) {
    throw new Error(`${name} returned an unexpected project setup preview.`)
  }
}

const verifyInstalledMetadata = (metadata, name) => {
  if (metadata.name !== '@santi020k/commitprompt') {
    throw new Error(`${name} installed unexpected package metadata.`)
  }

  if (metadata.dependencies?.['@commitlint/load'] !== undefined) {
    throw new Error(
      `${name} installed the TypeScript-dependent Commitlint loader.`
    )
  }

  if (metadata.dependencies?.['@commitlint/lint'] !== undefined) {
    throw new Error(`${name} installed the unbundled Commitlint lint engine.`)
  }

  if (
    metadata.dependencies?.typescript !== undefined ||
    metadata.optionalDependencies?.typescript !== undefined
  ) {
    throw new Error(
      `${name} installed TypeScript in the runtime dependency surface.`
    )
  }
}

const verifyNoStaleArtifacts = (installedPackageDirectory, name) => {
  for (const artifact of [
    'dist/src/package-manager.d.ts',
    'dist/src/package-manager.d.ts.map',
    'dist/src/package-manager.js',
    'dist/src/package-manager.js.map'
  ]) {
    if (existsSync(join(installedPackageDirectory, artifact))) {
      throw new Error(`${name} installed stale artifact ${artifact}.`)
    }
  }
}

const verifyNativeTypeScriptConfiguration = (
  binary,
  consumerDirectory,
  name
) => {
  for (const dependencyPath of [
    'node_modules/typescript',
    'node_modules/@types/node'
  ]) {
    if (existsSync(join(consumerDirectory, dependencyPath))) {
      throw new Error(
        `${name} installed unexpected runtime tooling at ${dependencyPath}.`
      )
    }
  }

  const configurationPath = join(
    consumerDirectory, 'commitlint.config.ts'
  )

  writeFileSync(configurationPath, `const types: string[] = ['fix', 'release']

export default {
  rules: {
    'type-enum': [2, 'always', types]
  }
}
`)

  try {
    const configuredTypes = JSON.parse(executeBinarySync(
      binary,
      ['types', '--json'],
      {
        cwd: consumerDirectory,
        encoding: 'utf8'
      }
    ))

    if (configuredTypes.types.map(type => type.value).join(',') !== 'fix,release') {
      throw new Error(
        `${name} did not load its native TypeScript Commitlint configuration.`
      )
    }

    const validation = JSON.parse(executeBinarySync(
      binary,
      ['validate', '--json'],
      {
        cwd: consumerDirectory,
        encoding: 'utf8',
        input: 'release: verify native TypeScript configuration'
      }
    ))

    if (validation.valid !== true) {
      throw new Error(
        `${name} did not enforce its native TypeScript configuration.`
      )
    }
  } finally {
    unlinkSync(configurationPath)
  }
}

const verifyConsumer = (consumerDirectory, name) => {
  const installedPackageDirectory = join(
    consumerDirectory,
    'node_modules/@santi020k/commitprompt'
  )

  const installedMetadata = JSON.parse(readFileSync(
    join(installedPackageDirectory, 'package.json'),
    'utf8'
  ))

  verifyInstalledMetadata(installedMetadata, name)

  verifyNoStaleArtifacts(installedPackageDirectory, name)

  const thirdPartyLicenses = readFileSync(
    join(installedPackageDirectory, 'dist/THIRD_PARTY_LICENSES.txt'),
    'utf8'
  )

  for (const bundledDependency of ['@commitlint/lint@', 'es-toolkit@']) {
    if (!thirdPartyLicenses.includes(bundledDependency)) {
      throw new Error(
        `${name} omitted the ${bundledDependency} bundled license notice.`
      )
    }
  }

  readFileSync(
    join(installedPackageDirectory, 'dist/src/index.js.map'),
    'utf8'
  )

  readFileSync(
    join(installedPackageDirectory, 'dist/src/index.d.ts.map'),
    'utf8'
  )

  const agentGuide = readFileSync(
    join(installedPackageDirectory, 'AI.md'),
    'utf8'
  )

  if (!agentGuide.includes('commitprompt types --json')) {
    throw new Error(`${name} did not install the AI agent guide.`)
  }

  for (const templatePath of [
    'templates/AGENTS.md',
    'templates/copilot-instructions.md',
    'templates/skills/commitprompt/SKILL.md'
  ]) {
    readFileSync(join(installedPackageDirectory, templatePath), 'utf8')
  }

  const binary = join(
    consumerDirectory,
    'node_modules/.bin',
    process.platform === 'win32' ? 'commitprompt.cmd' : 'commitprompt'
  )

  const output = executeBinarySync(binary, ['--help'], {
    cwd: consumerDirectory,
    encoding: 'utf8'
  })

  if (!output.includes('A focused prompt for Conventional Commits.')) {
    throw new Error(`${name} did not install a working binary.`)
  }

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      [
        "const api = await import('@santi020k/commitprompt')",
        "if (typeof api.runCommitFlow !== 'function') throw new Error('Missing runCommitFlow export')",
        "if (typeof api.runAutomation !== 'function') throw new Error('Missing runAutomation export')",
        "if (typeof api.createCommitlintValidator !== 'function') throw new Error('Missing validator export')",
        'const validator = api.createCommitlintValidator(process.cwd())',
        'const report = await validator.validate("not conventional")',
        "if (report.valid) throw new Error('Built-in rules accepted an invalid message')",
        'const types = await validator.getTypes()',
        "if (types[0]?.value !== 'feat') throw new Error('Built-in prompt types were not loaded')",
        'const scopes = await validator.getScopes()',
        "if (scopes.length !== 0) throw new Error('Unexpected built-in prompt scopes')"
      ].join(';')
    ],
    {
      cwd: consumerDirectory,
      stdio: 'inherit'
    }
  )

  verifyInstalledCommands(binary, consumerDirectory, name)

  verifyNativeTypeScriptConfiguration(binary, consumerDirectory, name)

  return binary
}

let integrationConsumer
let integrationBinary

for (const packageManager of packageManagers) {
  const consumerDirectory = join(temporaryDirectory, packageManager.name)

  mkdirSync(consumerDirectory)

  writeFileSync(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({
      name: `commitprompt-${packageManager.name.toLowerCase()}-test`,
      private: true,
      type: 'module'
    })
  )

  installPackage({
    ...packageManager,
    consumerDirectory
  })

  const binary = verifyConsumer(consumerDirectory, packageManager.name)

  if (packageManager.name === 'npm') {
    integrationConsumer = consumerDirectory

    integrationBinary = binary
  }
}

if (!integrationConsumer || !integrationBinary) {
  throw new Error('The npm integration consumer was not created.')
}

execFileSync('git', ['init', '--quiet'], { cwd: integrationConsumer })

execFileSync('git', ['config', 'user.name', 'Commitprompt Tests'], {
  cwd: integrationConsumer
})

execFileSync('git', ['config', 'user.email', 'tests@commitprompt.dev'], {
  cwd: integrationConsumer
})

writeFileSync(join(integrationConsumer, 'example.txt'), 'integration\n')

execFileSync('git', ['add', 'example.txt'], { cwd: integrationConsumer })

const interactions = [
  { answer: '1\n', prompt: 'Type: ' },
  { answer: '\n', prompt: 'Scope (optional): ' },
  { answer: 'verify installed cli\n', prompt: 'Short imperative description: ' },
  {
    answer: '\n',
    prompt: 'Longer description (optional; finish with an empty line): '
  },
  { answer: 'n\n', prompt: 'Does this include a breaking change? [y/N] ' },
  {
    answer: '\n',
    prompt: 'Issue references (optional, e.g. "Closes #123"): '
  },
  { answer: 'y\n', prompt: 'Create this commit? [y/N] ' }
]

await new Promise((resolve, reject) => {
  const invocation = getBinaryInvocation(integrationBinary, [])

  const child = spawn(invocation.command, invocation.arguments_, {
    cwd: integrationConsumer,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsVerbatimArguments: invocation.windowsVerbatimArguments
  })

  let output = ''
  let interactionIndex = 0

  const advance = () => {
    const interaction = interactions[interactionIndex]

    if (!interaction || !output.includes(interaction.prompt)) return

    interactionIndex += 1

    child.stdin.write(interaction.answer)
  }

  child.stdout.on('data', chunk => {
    output += chunk.toString()

    advance()
  })

  child.stderr.on('data', chunk => {
    output += chunk.toString()

    advance()
  })

  child.on('error', reject)

  child.on('exit', code => {
    if (code !== 0) {
      reject(new Error(`Installed CLI exited with ${code}:\n${output}`))

      return
    }

    if (interactionIndex !== interactions.length) {
      reject(new Error(`Installed CLI missed an interaction:\n${output}`))

      return
    }

    resolve()
  })
})

const subject = execFileSync(
  'git',
  ['log', '-1', '--pretty=%s'],
  { cwd: integrationConsumer, encoding: 'utf8' }
).trim()

if (subject !== 'feat: verify installed cli') {
  throw new Error(`Installed CLI created an unexpected commit: ${subject}`)
}

writeFileSync(join(integrationConsumer, 'automation.txt'), 'automation\n')

execFileSync('git', ['add', 'automation.txt'], { cwd: integrationConsumer })

const automationInput = JSON.stringify({
  body: '',
  breaking: '',
  issues: '',
  scope: 'cli',
  subject: 'verify non-interactive commit',
  type: 'test'
})

const automationOutput = executeBinarySync(
  integrationBinary,
  ['commit', '--yes', '--json'],
  {
    cwd: integrationConsumer,
    encoding: 'utf8',
    input: automationInput
  }
)

const automationResult = JSON.parse(automationOutput)

if (
  automationResult.committed !== true
  || automationResult.message !== 'test(cli): verify non-interactive commit'
) {
  throw new Error('Installed CLI returned an unexpected automation result.')
}

const automationSubject = execFileSync(
  'git',
  ['log', '-1', '--pretty=%s'],
  { cwd: integrationConsumer, encoding: 'utf8' }
).trim()

if (automationSubject !== 'test(cli): verify non-interactive commit') {
  throw new Error(
    `Installed CLI created an unexpected automated commit: ${automationSubject}`
  )
}

writeFileSync(
  join(integrationConsumer, 'commitlint.config.mjs'),
  [
    'export default {',
    "  extends: ['@commitlint/config-conventional'],",
    '  rules: {',
    "    'body-max-line-length': [0],",
    "    'footer-max-line-length': [0],",
    "    'header-max-length': [0]",
    '  }',
    '}'
  ].join('\n')
)

const conventionalTypes = JSON.parse(executeBinarySync(
  integrationBinary,
  ['types', '--json'],
  {
    cwd: integrationConsumer,
    encoding: 'utf8'
  }
))

if (conventionalTypes.types[0]?.value !== 'feat') {
  throw new Error(
    'Installed CLI did not preserve the curated conventional type order.'
  )
}

writeFileSync(
  join(integrationConsumer, 'commitlint.config.mjs'),
  [
    'export default {',
    '  rules: {',
    "    'type-enum': [2, 'always', ['fix', 'release']],",
    "    'scope-enum': [2, 'always', ['cli', 'docs']]",
    '  }',
    '}'
  ].join('\n')
)

execFileSync(
  process.execPath,
  [
    '--input-type=module',
    '--eval',
    [
      "const api = await import('@santi020k/commitprompt')",
      'const validator = api.createCommitlintValidator(process.cwd())',
      'const types = await validator.getTypes()',
      'const values = types.map(type => type.value).join(",")',
      "if (values !== 'fix,release') throw new Error(`Unexpected repository types: ${values}`)",
      'const scopes = await validator.getScopes()',
      'const scopeValues = scopes.join(",")',
      "if (scopeValues !== 'cli,docs') throw new Error(`Unexpected repository scopes: ${scopeValues}`)"
    ].join(';')
  ],
  {
    cwd: integrationConsumer,
    stdio: 'inherit'
  }
)

const configuredScopes = JSON.parse(executeBinarySync(
  integrationBinary,
  ['scopes', '--json'],
  {
    cwd: integrationConsumer,
    encoding: 'utf8'
  }
))

if (configuredScopes.scopes.join(',') !== 'cli,docs') {
  throw new Error('Installed CLI returned unexpected repository scopes.')
}

mkdirSync(join(integrationConsumer, '.vscode'))

writeFileSync(
  join(integrationConsumer, '.vscode', 'settings.json'),
  `{
  // Preserve exported VS Code preferences.
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
  },
}
`
)

mkdirSync(join(integrationConsumer, '.zed'))

writeFileSync(
  join(integrationConsumer, '.zed', 'settings.json'),
  `{
  // Preserve exported Zed preferences.
  "agent": {
    "default_model": {
      "provider": "openai",
    },
  },
}
`
)

const editorSetup = JSON.parse(executeBinarySync(
  integrationBinary,
  ['setup', 'editors', '--json'],
  {
    cwd: integrationConsumer,
    encoding: 'utf8'
  }
))

if (editorSetup.changed !== true || editorSetup.drift !== true) {
  throw new Error('Installed CLI did not configure workspace editors.')
}

const editorCheck = JSON.parse(executeBinarySync(
  integrationBinary,
  ['setup', 'editors', '--check', '--json'],
  {
    cwd: integrationConsumer,
    encoding: 'utf8'
  }
))

if (editorCheck.drift !== false) {
  throw new Error('Installed workspace editor setup was not idempotent.')
}

const projectSetup = JSON.parse(executeBinarySync(
  integrationBinary,
  ['setup', 'project', '--json'],
  {
    cwd: integrationConsumer,
    encoding: 'utf8'
  }
))

if (projectSetup.changed !== true) {
  throw new Error('Installed CLI did not configure the consumer repository.')
}

const projectCheck = JSON.parse(executeBinarySync(
  integrationBinary,
  ['setup', 'project', '--check', '--json'],
  {
    cwd: integrationConsumer,
    encoding: 'utf8'
  }
))

if (projectCheck.drift !== false) {
  throw new Error('Installed project setup was not idempotent.')
}

const validMessagePath = join(temporaryDirectory, 'valid-message.txt')
const invalidMessagePath = join(temporaryDirectory, 'invalid-message.txt')

writeFileSync(validMessagePath, 'fix: verify generated hook\n')

writeFileSync(invalidMessagePath, 'feat: reject configured type\n')

const hookPath = join(integrationConsumer, '.husky', 'commit-msg')

const hookEnvironment = {
  ...process.env,
  PATH: `${join(integrationConsumer, 'node_modules/.bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`
}

execFileSync('sh', [hookPath, validMessagePath], {
  cwd: integrationConsumer,
  env: hookEnvironment,
  stdio: 'inherit'
})

const invalidHook = spawnSync('sh', [hookPath, invalidMessagePath], {
  cwd: integrationConsumer,
  encoding: 'utf8',
  env: hookEnvironment
})

if (invalidHook.status === 0) {
  throw new Error('Generated consumer hook accepted an invalid message.')
}

if (!`${invalidHook.stdout}\n${invalidHook.stderr}`.includes('Commit blocked')) {
  throw new Error('Generated consumer hook omitted blocked-commit diagnostics.')
}

process.stdout.write(
  'Packed package installation passed for npm, pnpm, and Yarn.\n'
)
