import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { classifyPaths, gitEnvironment, planScope } from './ci-scope.mjs'

test('only documentation changes use the docs task graph', () => {
  for (const paths of [['apps/docs/src/pages/docs.astro'], ['apps/docs/tests/navigation.spec.ts', '.changeset/notes.md'], ['docs/design-guide.md']]) {
    assert.deepEqual(classifyPaths(paths), { mode: 'affected', docs: true, package: false })
  }

  for (const paths of [[], ['packages/commitprompt/src/index.ts'], ['apps/docs/package.json'], ['apps/docs/astro.config.mjs'], ['scripts/check.mjs'], ['unknown.txt'], ['pnpm-lock.yaml'], ['.changeset/config.json']]) {
    assert.deepEqual(classifyPaths(paths), { mode: 'full', docs: true, package: true })
  }
})

test('release, push, dispatch and uncertain history retain full validation', () => {
  for (const env of [{ GITHUB_HEAD_REF: 'release/v1.2.0' }, { GITHUB_HEAD_REF: 'changeset-release/main' }, { GITHUB_EVENT_NAME: 'push' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }]) {
    assert.equal(planScope({ base: 'HEAD', env }).mode, 'full')
  }

  assert.equal(planScope({ base: 'missing', env: {} }).mode, 'full')

  assert.equal(planScope({ base: 'HEAD', full: true, env: {} }).mode, 'full')
})

test('real Git history includes both rename sides, deletions and local files', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'commitprompt-ci-scope-'))
  const env = { ...gitEnvironment(), GITHUB_EVENT_NAME: 'pull_request', GITHUB_HEAD_REF: 'ci/fixture' }
  const git = (...args) => execFileSync('git', args, { cwd, env, stdio: 'pipe' })

  const write = (path, content) => {
    mkdirSync(join(cwd, path, '..'), { recursive: true })

    writeFileSync(join(cwd, path), content)
  }

  try {
    git('init', '-q', '-b', 'main')

    git('config', 'user.name', 'CI fixture')

    git('config', 'user.email', 'ci@example.test')

    write('apps/docs/src/deleted.astro', '<p>Original</p>')

    write('packages/commitprompt/src/moved.ts', '// Original')

    git('add', '.')

    git('commit', '-qm', 'fixture')

    git('branch', 'feature')

    write('unrelated-base-file', 'base only')

    git('add', '.')

    git('commit', '-qm', 'base')

    git('switch', 'feature')

    git('rm', 'apps/docs/src/deleted.astro')

    git('commit', '-qm', 'remove documentation')

    const poisoned = { ...env, GIT_DIR: '/missing', GIT_WORK_TREE: '/missing' }

    assert.equal(planScope({ cwd, base: 'main', env: poisoned }).mode, 'affected')

    write('apps/docs/src/ leading\nname.astro', '<p>New</p>')

    assert.equal(planScope({ cwd, base: 'main', env }).mode, 'affected')

    write('local-config.json', '{}')

    assert.equal(planScope({ cwd, base: 'main', env }).mode, 'full')

    git('add', 'local-config.json')

    assert.equal(planScope({ cwd, base: 'main', env }).mode, 'full')

    const head = git('rev-parse', 'HEAD').toString().trim()

    assert.equal(planScope({ cwd, base: 'main', head, env }).mode, 'affected')

    git('rm', '--cached', 'local-config.json')

    git('mv', 'packages/commitprompt/src/moved.ts', 'apps/docs/src/moved.ts')

    git('commit', '-qm', 'move package source into docs')

    assert.equal(planScope({ cwd, base: 'main', head: git('rev-parse', 'HEAD').toString().trim(), env }).mode, 'full')
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
