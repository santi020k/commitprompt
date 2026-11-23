import { readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const validateReleaseMetadata = ({ branch, version, changelog, fragments }) => {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/iu.test(version)) {
    throw new Error('Release package version must be a semantic version.')
  }

  if (branch !== `release/v${version}` && branch !== 'changeset-release/main') {
    throw new Error('Release branch must match the package version.')
  }

  if (!changelog.split(/\r?\n/u).some(line => line === `## ${version}`)) {
    throw new Error('Release version must have a changelog entry.')
  }

  if (fragments.some(name => name.endsWith('.md') && name !== 'README.md')) {
    throw new Error('Consume pending Changesets before preparing a release.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(readFileSync(new URL('../packages/commitprompt/package.json', import.meta.url), 'utf8'))

  validateReleaseMetadata({
    branch: process.argv[2],
    version,
    changelog: readFileSync(new URL('../packages/commitprompt/CHANGELOG.md', import.meta.url), 'utf8'),
    fragments: readdirSync(new URL('../.changeset', import.meta.url)),
  })

  console.log(`Verified consumed release metadata for ${version}.`)
}
