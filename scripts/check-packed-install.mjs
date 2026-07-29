import { execFileSync, spawn } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

const repositoryRoot = resolve(import.meta.dirname, '..')
const packageDirectory = join(repositoryRoot, 'packages/commitprompt')
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'commitprompt-pack-'))

const packOutput = execFileSync(
  'pnpm',
  ['pack', '--json', '--pack-destination', temporaryDirectory],
  {
    cwd: packageDirectory,
    encoding: 'utf8'
  }
)

const packResult = JSON.parse(packOutput)

const tarballName = Array.isArray(packResult)
  ? packResult[0]?.filename
  : packResult.filename

if (!tarballName) throw new Error('pnpm pack did not return a tarball filename.')

const tarballPath = isAbsolute(tarballName)
  ? tarballName
  : join(temporaryDirectory, tarballName)

const packageManagers = [
  {
    args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath],
    command: 'npm',
    name: 'npm'
  },
  {
    args: ['add', '--ignore-scripts', tarballPath],
    command: 'pnpm',
    name: 'pnpm'
  },
  {
    args: ['add', '--ignore-scripts', '--non-interactive', tarballPath],
    command: 'yarn',
    name: 'Yarn'
  }
]

const verifyConsumer = (consumerDirectory, name) => {
  const installedMetadata = JSON.parse(readFileSync(
    join(consumerDirectory, 'node_modules/commitprompt/package.json'),
    'utf8'
  ))

  if (installedMetadata.name !== 'commitprompt') {
    throw new Error(`${name} installed unexpected package metadata.`)
  }

  const binary = join(
    consumerDirectory,
    'node_modules/.bin',
    process.platform === 'win32' ? 'commitprompt.cmd' : 'commitprompt'
  )

  const output = execFileSync(binary, ['--help'], {
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
        "const api = await import('commitprompt')",
        "if (typeof api.runCommitFlow !== 'function') throw new Error('Missing runCommitFlow export')",
        "if (typeof api.createCommitlintValidator !== 'function') throw new Error('Missing validator export')"
      ].join(';')
    ],
    {
      cwd: consumerDirectory,
      stdio: 'inherit'
    }
  )

  return binary
}

let integrationConsumer
let integrationBinary

for (const packageManager of packageManagers) {
  const consumerDirectory = join(temporaryDirectory, packageManager.name)

  mkdirSync(consumerDirectory)

  writeFileSync(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({ name: `commitprompt-${packageManager.name.toLowerCase()}-test`, private: true })
  )

  execFileSync(packageManager.command, packageManager.args, {
    cwd: consumerDirectory,
    stdio: 'inherit'
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
  const child = spawn(integrationBinary, {
    cwd: integrationConsumer,
    stdio: ['pipe', 'pipe', 'pipe']
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

console.log('Packed package installation passed for npm, pnpm, and Yarn.')
