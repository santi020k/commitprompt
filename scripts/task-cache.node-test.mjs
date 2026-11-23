import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { gitEnvironment } from './ci-scope.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const turbo = join(dirname(require.resolve('turbo/package.json')), 'bin/turbo')

test('shared compiler and lint inputs invalidate actual Turbo task hashes', context => {
  const directory = mkdtempSync(join(tmpdir(), 'commitprompt-task-cache-'))
  const environment = gitEnvironment()

  context.after(() => rmSync(directory, { recursive: true, force: true }))

  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, env: environment, encoding: 'utf8' }).split('\0').filter(Boolean)

  for (const file of tracked) {
    if (!lstatSync(join(root, file), { throwIfNoEntry: false })?.isFile()) continue

    mkdirSync(dirname(join(directory, file)), { recursive: true })

    copyFileSync(join(root, file), join(directory, file))
  }

  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction')

  execFileSync('git', ['init', '--quiet'], { cwd: directory, env: environment })

  const hashes = (extraEnvironment = {}) => {
    const output = execFileSync(process.execPath, [turbo, 'run', 'build', 'typecheck', 'lint', '--dry=json'], {
      cwd: directory,
      env: { ...environment, ...extraEnvironment },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })

    const { tasks } = JSON.parse(output)

    assert.ok(Array.isArray(tasks) && tasks.length > 0)

    return new Map(tasks.map(task => [task.taskId, task.hash]))
  }

  const before = hashes()
  const packageName = '@santi020k/commitprompt'

  const inputs = [
    ['tsconfig.base.json', ['build', 'typecheck']],
    ['tsconfig.eslint.json', ['lint']],
    ['eslint.config.js', ['lint']],
    ['.cspell.json', ['lint']],
  ]

  for (const [file, tasks] of inputs) {
    const path = join(directory, file)
    const original = readFileSync(path, 'utf8')

    writeFileSync(path, `${original}\n`)

    const after = hashes()

    for (const task of tasks) {
      const identifier = `${packageName}#${task}`

      assert.ok(before.has(identifier), `Missing fixture task ${identifier}`)

      assert.notEqual(after.get(identifier), before.get(identifier), `${file} must invalidate ${identifier}`)
    }

    writeFileSync(path, original)
  }

  const changedRuntime = hashes({ QUALITY_TASK_RUNTIME: 'fixture-runtime-identity' })

  for (const identifier of before.keys()) assert.notEqual(changedRuntime.get(identifier), before.get(identifier))

  const changedSite = hashes({ PUBLIC_SITE_URL: 'https://fixture.example.test' })

  assert.notEqual(changedSite.get('commitprompt-docs#build'), before.get('commitprompt-docs#build'))

  assert.equal(changedSite.get('@santi020k/commitprompt#build'), before.get('@santi020k/commitprompt#build'))

  const readme = join(directory, 'README.md')

  writeFileSync(readme, `${readFileSync(readme, 'utf8')}\nUnrelated documentation fixture.\n`)

  assert.deepEqual(hashes(), before)
})


test('CI cached jobs export the resolved runtime before running tasks', context => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const directory = mkdtempSync(join(tmpdir(), 'commitprompt-runtime-export-'))

  context.after(() => rmSync(directory, { recursive: true, force: true }))

  for (const name of ['full', 'compatibility', 'windows']) {
    const job = workflow.split(`  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/u)[0]
    const binding = job.split('      - name: Bind task cache to the resolved runtime\n')[1]

    assert.ok(binding, `${name} must export runtime identity`)

    const command = binding.split('        run: |\n')[1].split('      - name:')[0].replace(/^ {10}/gmu, '')
    const target = join(directory, name)

    execFileSync('bash', ['-e', '-c', command], { env: { ...process.env, GITHUB_ENV: target } })

    const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim()

    assert.equal(readFileSync(target, 'utf8').trim(), `QUALITY_TASK_RUNTIME=${process.version}-${pnpmVersion}-${process.platform}/${process.arch}`)

    assert.ok(job.indexOf('Bind task cache') > job.indexOf('Set up pnpm workspace'))

    assert.ok(job.indexOf('Bind task cache') < job.indexOf('run: pnpm'))
  }
})
