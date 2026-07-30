import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const repositoryRoot = resolve(import.meta.dirname, '..')

const metadata = JSON.parse(readFileSync(
  resolve(repositoryRoot, 'packages/commitprompt/package.json'),
  'utf8'
))

const packageName = process.env.PACKAGE_NAME ?? metadata.name
const expectedVersion = process.env.PACKAGE_VERSION ?? metadata.version
const attempts = Number(process.env.NPM_VERIFY_ATTEMPTS ?? 6)
const initialDelay = Number(process.env.NPM_VERIFY_DELAY_MS ?? 2_000)

if (!packageName || !expectedVersion) {
  throw new Error('A package name and version are required for verification.')
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const publishedVersion = execFileSync(
      'npm',
      ['view', `${packageName}@${expectedVersion}`, 'version', '--json'],
      { encoding: 'utf8' }
    ).trim()

    const parsedVersion = JSON.parse(publishedVersion)

    if (parsedVersion !== expectedVersion) {
      throw new Error(
        `Expected ${packageName}@${expectedVersion}, received ${parsedVersion}.`
      )
    }

    const latestVersion = JSON.parse(execFileSync(
      'npm',
      ['view', packageName, 'dist-tags.latest', '--json'],
      { encoding: 'utf8' }
    ).trim())

    if (latestVersion !== expectedVersion) {
      throw new Error(
        `Expected the latest dist-tag to be ${expectedVersion}, ` +
        `received ${String(latestVersion)}.`
      )
    }

    process.stdout.write(
      `Verified ${packageName}@${expectedVersion} and its latest dist-tag on npm.\n`
    )

    break
  }
  catch (error) {
    if (attempt === attempts) throw error

    const wait = initialDelay * attempt

    process.stderr.write(
      `npm has not exposed ${packageName}@${expectedVersion}; ` +
      `retrying in ${wait}ms.\n`
    )

    await delay(wait)
  }
}

execFileSync(
  process.execPath,
  [resolve(repositoryRoot, 'scripts/check-packed-install.mjs')],
  {
    env: {
      ...process.env,
      COMMITPROMPT_PACKAGE_SPEC: `${packageName}@${expectedVersion}`
    },
    stdio: 'inherit'
  }
)

process.stdout.write(
  `Verified installed contents and consumer workflows for ` +
  `${packageName}@${expectedVersion}.\n`
)
