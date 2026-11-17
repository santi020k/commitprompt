import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { ESLint } from 'eslint'

import configuration from '../eslint.config.js'

const formatsRequire = createRequire(import.meta.resolve('@santi020k/eslint-config-formats'))
const pluginRequire = createRequire(formatsRequire.resolve('eslint-plugin-mdx'))
const parserRequire = createRequire(pluginRequire.resolve('eslint-mdx'))
const engineRequire = createRequire(parserRequire.resolve('unified-engine'))
const { glob } = engineRequire('glob')

test('Markdown toolchain glob preserves ignored files and cancellation', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'beacon-glob-'))

  context.after(() => rm(directory, { recursive: true, force: true }))

  for (const path of ['docs', 'node_modules/fixture']) await mkdir(join(directory, path), { recursive: true })

  await writeFile(join(directory, 'docs/guide.md'), '# Guide')

  await writeFile(join(directory, 'node_modules/fixture/hidden.md'), '# Hidden')

  assert.deepEqual(await glob('**/*.md', { cwd: directory, ignore: ['node_modules/**'] }), ['docs/guide.md'])

  const controller = new AbortController()

  controller.abort(new Error('Fixture cancelled'))

  await assert.rejects(glob('**/*', { cwd: directory, signal: controller.signal }), /Fixture cancelled/u)
})

test('shared import rule preserves patched matcher boundaries', async () => {
  const entry = (await configuration).find(config => config.plugins?.import)

  assert.ok(entry)

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      plugins: { 'import-x': entry.plugins.import },
      rules: { 'import-x/no-internal-modules': ['error', { forbid: ['**/internal/**'] }] },
    }],
  })

  const denied = await eslint.lintText('import value from "./internal/secret.js"', { filePath: 'fixture.js' })
  const allowed = await eslint.lintText('import value from "./public.js"', { filePath: 'fixture.js' })

  assert.equal(denied[0].messages.length, 1)

  assert.equal(denied[0].messages[0].ruleId, 'import-x/no-internal-modules')

  assert.equal(allowed[0].messages.length, 0)
})
