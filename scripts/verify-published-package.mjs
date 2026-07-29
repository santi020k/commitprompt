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

    console.log(`Verified ${packageName}@${expectedVersion} on npm.`)

    break
  }
  catch (error) {
    if (attempt === attempts) throw error

    const wait = initialDelay * attempt

    console.warn(
      `npm has not exposed ${packageName}@${expectedVersion}; retrying in ${wait}ms.`
    )

    await delay(wait)
  }
}
