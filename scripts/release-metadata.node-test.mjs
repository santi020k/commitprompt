import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { validateReleaseMetadata } from './release-metadata.mjs'

const release = {
  branch: 'release/v1.2.0', version: '1.2.0', changelog: '# Changelog\n\n## 1.2.0\n',
  fragments: ['README.md', 'config.json'],
}

test('prepared release metadata accepts matching consumed versions', () => {
  for (const branch of ['release/v1.2.0', 'changeset-release/main']) {
    assert.doesNotThrow(() => validateReleaseMetadata({ ...release, branch }))
  }
})

test('prepared release metadata rejects mismatches and pending fragments', () => {
  for (const changes of [
    { branch: 'release/v1.3.0' }, { branch: 'feature/example' },
    { version: 'invalid' }, { version: 12 }, { changelog: '## 1.2.1\n' },
    { fragments: [...release.fragments, 'pending.md'] },
  ]) assert.throws(() => validateReleaseMetadata({ ...release, ...changes }))
})

test('metadata edits reach the required aggregate before expensive validation', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  assert.match(workflow, /types: \[opened, synchronize, reopened, edited, labeled, unlabeled\]/u)

  for (const job of ['full', 'compatibility', 'windows']) {
    const body = workflow.split(`  ${job}:\n`)[1].split(/\n {2}[a-z-]+:\n/u)[0]

    assert.match(body, /needs: \[changes, metadata\]/u)
  }

  const metadata = workflow.split('  metadata:\n')[1].split('  impact:\n')[0]

  assert.match(metadata, /node scripts\/release-metadata.mjs "\$RELEASE_BRANCH"/u)

  assert.match(metadata, /elif \[\[ "\$SKIP_CHANGELOG" != true \]\]/u)
})


test('fresh dependency audit remains inside required validation for every event', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const full = workflow.split('  full:\n')[1].split('  compatibility:\n')[0]
  const audit = full.split('      - name: Audit dependencies\n')[1].split('      - name:')[0]

  assert.match(audit, /run: pnpm audit --audit-level moderate/u)

  assert.doesNotMatch(audit, /if:|continue-on-error/u)
})
