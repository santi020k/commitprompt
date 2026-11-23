import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { gitEnvironment } from './ci-scope.mjs'

const binary = process.env.QUALITY_BINARY
  ?? (process.env.GITHUB_JOB === 'impact' ? 'quality' : undefined)

test('Quality v2 selects docs consumers and broadens uncertain inputs', { skip: !binary }, () => {
  const cwd = mkdtempSync(join(tmpdir(), 'commitprompt-impact-'))
  const env = gitEnvironment()
  const git = args => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim()

  const write = (path, value) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })

    writeFileSync(join(cwd, path), value)
  }

  const policy = JSON.parse(readFileSync(new URL('../quality-impact.json', import.meta.url), 'utf8'))
  const plan = base => JSON.parse(execFileSync(binary, ['impact', 'plan', '--base', base, '--head', 'HEAD', '--format', 'json'], { cwd, env, encoding: 'utf8' }))
  const ids = result => result.selected.map(node => node.id).sort()

  try {
    git(['init', '-q', '-b', 'main'])

    git(['config', 'user.name', 'Fixture'])

    git(['config', 'user.email', 'fixture@example.test'])

    write('quality-impact.json', JSON.stringify(policy))

    write('apps/docs/src/page.astro', 'initial')

    git(['add', '.'])

    git(['commit', '-qm', 'initial'])

    const base = git(['rev-parse', 'HEAD'])

    write('apps/docs/src/page.astro', 'changed')

    git(['add', '.'])

    git(['commit', '-qm', 'docs'])

    assert.deepEqual(ids(plan(base)), ['docs', 'docs-browser', 'security'])

    for (const path of ['pnpm-lock.yaml', 'unknown.txt']) {
      const previous = git(['rev-parse', 'HEAD'])

      write(path, 'changed')

      git(['add', '.'])

      git(['commit', '-qm', 'fallback'])

      assert.deepEqual(ids(plan(previous)), Object.keys(policy.nodes).sort())
    }

    assert.deepEqual(ids(plan('missing-baseline')), Object.keys(policy.nodes).sort())
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
