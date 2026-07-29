import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

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

const consumerDirectory = join(temporaryDirectory, 'consumer')

mkdirSync(consumerDirectory)

execFileSync(
  'npm',
  ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath],
  {
    cwd: consumerDirectory,
    stdio: 'inherit'
  }
)

const installedMetadata = JSON.parse(readFileSync(
  join(consumerDirectory, 'node_modules/commitprompt/package.json'),
  'utf8'
))

if (installedMetadata.name !== 'commitprompt') {
  throw new Error('The packed package has unexpected metadata.')
}

const output = execFileSync(
  join(consumerDirectory, 'node_modules/.bin/commitprompt'),
  ['--help'],
  {
    cwd: consumerDirectory,
    encoding: 'utf8'
  }
)

if (!output.includes('A focused prompt for Conventional Commits.')) {
  throw new Error('The packed binary did not print the expected help output.')
}

console.log('Packed package installation passed.')
