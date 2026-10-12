import { spawnSync } from 'node:child_process'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, test } from 'vitest'
import { isScalar, isSeq, parseDocument } from 'yaml'

import { setupProject } from '../src/project.js'

const qualitySetupActions = ['dependency', 'commit-script', 'quality-hook', 'agents-instructions', 'copilot-instructions', 'agent-skill', 'claude-skill'] as const

const temporaryDirectories: string[] = []

const createProject = async (
  manifest: Record<string, unknown>
): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'commitprompt-project-'))

  temporaryDirectories.push(directory)
  await writeFile(
    join(directory, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8'
  )

  return directory
}

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)

    return true
  } catch {
    return false
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      force: true,
      recursive: true
    }))
  )
})

describe('setupProject', () => {
  test.each(['', '\n', '# Preserve this note\n'])('seeds version 1 for an empty Quality document: %j', async source => {
    const directory = await createProject({ name: 'consumer' })
    const hookPath = join(directory, 'quality.yml')

    await writeFile(hookPath, source)
    await setupProject({ actions: ['quality-hook'], cwd: directory })

    const updated = await readFile(hookPath, 'utf8')
    const document = parseDocument(updated)

    expect(document.get('version')).toBe(1)
    expect(document.getIn(['hooks', 'commit-msg', 'steps', 0, 'name']))
      .toBe('Validate commit message with Commitprompt')
    expect(updated.includes('# Preserve this note')).toBe(source.includes('#'))

    await expect(setupProject({ actions: ['quality-hook'], check: true, cwd: directory }))
      .resolves.toEqual(expect.objectContaining({ drift: false }))
  })

  test.each([
    { check: false, dryRun: false },
    { check: true, dryRun: false },
    { check: false, dryRun: true }
  ])('rejects duplicate managed Quality steps before writing: %j', async mode => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const hookPath = join(directory, 'quality.yml')
    const source = `version: 1
hooks:
  commit-msg:
    steps:
      - name: Validate commit message with Commitprompt
        command: stale-validator
      - name: " Validate commit message with Commitprompt "
        command: node
`

    await writeFile(hookPath, source)

    await expect(setupProject({ ...mode, actions: qualitySetupActions, cwd: directory }))
      .rejects.toThrow('duplicate managed Quality hook steps')
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(source)
    await expect(pathExists(join(directory, 'AGENTS.md'))).resolves.toBe(false)
  })

  test.each([false, true])('npm hooks use only the locally installed scoped API: installed=%j', async installed => {
    const directory = await createProject({ name: 'consumer', packageManager: 'npm@11.4.2' })
    const messagePath = join(directory, 'COMMIT MESSAGE')
    const message = 'fix: preserve café input\n'

    await writeFile(messagePath, message)

    if (installed) {
      const packageDirectory = join(directory, 'node_modules', '@santi020k', 'commitprompt')

      await mkdir(packageDirectory, { recursive: true })
      await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({
        exports: './index.mjs', name: '@santi020k/commitprompt', type: 'module'
      }))
      await writeFile(join(packageDirectory, 'index.mjs'), `import { realpath, writeFile } from 'node:fs/promises'
export const runAutomation = async ({ command, cwd, input }) => {
  await writeFile('received.json', JSON.stringify({ command, cwd: await realpath(cwd), input }))
  return 0
}
`)
    }

    await setupProject({ actions: ['quality-hook'], cwd: directory })

    const document = parseDocument(await readFile(join(directory, 'quality.yml'), 'utf8'))
    const argumentsNode = document.getIn(['hooks', 'commit-msg', 'steps', 0, 'args'], true)

    if (!isSeq(argumentsNode)) throw new TypeError('Expected hook arguments.')

    const args = argumentsNode.items.map((item: unknown) => {
      if (!isScalar(item) || typeof item.value !== 'string') throw new TypeError('Expected string arguments.')

      return item.value
    })

    expect(document.getIn(['hooks', 'commit-msg', 'steps', 0, 'command'])).toBe('node')

    const result = spawnSync(process.execPath, [...args, messagePath], { cwd: directory, encoding: 'utf8' })

    expect(result.error).toBeUndefined()

    expect(result.status).toBe(installed ? 0 : 1)
    expect(result.stderr).toMatch(installed ? /^$/u : /Cannot find package '@santi020k\/commitprompt'/u)
    await expect(pathExists(join(directory, 'node_modules'))).resolves.toBe(installed)

    const received: unknown = installed ?
      JSON.parse(await readFile(join(directory, 'received.json'), 'utf8')) :
      undefined

    expect(received).toEqual(installed ?
      { command: 'validate', cwd: await realpath(directory), input: message } :
      undefined)
  })

  test('supports the released explicit Husky setup action', async () => {
    const directory = await createProject({
      devDependencies: {
        husky: '^8.0.0'
      },
      name: 'consumer',
      scripts: {
        prepare: 'node scripts/prepare.mjs && husky install'
      }
    })

    await setupProject({
      actions: ['husky-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    ) as {
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }

    expect(manifest.devDependencies.husky).toBe('^8.0.0')
    expect(manifest.scripts.prepare).toBe('node scripts/prepare.mjs && husky')
  })

  test('preserves default Husky setup and existing authored hook commands', async () => {
    const directory = await createProject({
      config: {
        commitizen: {
          path: 'cz-conventional-changelog'
        }
      },
      devDependencies: {
        commitizen: '^4.3.1',
        czg: '^1.12.0'
      },
      name: 'consumer',
      packageManager: 'npm@11.4.2',
      scripts: {
        legacyCommit: 'git-cz',
        test: 'node --test'
      }
    })
    const agentsPath = join(directory, 'AGENTS.md')
    const hookPath = join(directory, '.husky', 'commit-msg')

    await writeFile(agentsPath, '# Project guidance\n', 'utf8')
    await mkdir(join(directory, '.husky'))
    await writeFile(
      hookPath, 'node scripts/check-ticket.mjs\npnpm exec commitlint --edit "$1"\n', 'utf8'
    )

    const firstResult = await setupProject({
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(firstResult).toEqual(expect.objectContaining({
      changed: true,
      drift: true,
      obsolete: [
        'dependency:commitizen',
        'dependency:czg',
        'package.json:config.commitizen',
        'package.json:scripts.legacyCommit'
      ],
      packageManager: 'npm'
    }))
    expect(firstResult.actions.map(action => action.id)).toEqual([
      'dependency',
      'commit-script',
      'husky-hook',
      'agents-instructions',
      'copilot-instructions',
      'agent-skill',
      'claude-skill'
    ])

    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    ) as {
      config: { commitizen: unknown }
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }

    expect(manifest.devDependencies).toEqual({
      '@santi020k/commitprompt': '^1.2.3',
      commitizen: '^4.3.1',
      czg: '^1.12.0',
      husky: '^9.1.7'
    })
    expect(manifest.scripts).toEqual({
      commit: 'commitprompt',
      legacyCommit: 'git-cz',
      prepare: 'husky',
      test: 'node --test'
    })
    expect(manifest.config.commitizen).toBeDefined()

    const hook = await readFile(hookPath, 'utf8')

    expect(hook).toContain('node scripts/check-ticket.mjs')
    expect(hook).not.toContain('commitlint')
    expect(hook).toContain('commitprompt validate --input "$1"')

    const hookIsExecutable = ((await stat(hookPath)).mode & 0o111) !== 0

    expect(process.platform === 'win32' || hookIsExecutable).toBe(true)

    const agents = await readFile(agentsPath, 'utf8')
    const copilot = await readFile(
      join(directory, '.github', 'copilot-instructions.md'), 'utf8'
    )
    const agentSkillPath =
      join(directory, '.agents', 'skills', 'commitprompt', 'SKILL.md')
    const claudeSkillPath =
      join(directory, '.claude', 'skills', 'commitprompt', 'SKILL.md')
    const agentSkill = await readFile(agentSkillPath, 'utf8')
    const claudeSkill = await readFile(claudeSkillPath, 'utf8')

    expect(agents).toContain('# Project guidance')
    expect(agents).toContain('<!-- commitprompt:start -->')
    expect(copilot).toContain('<!-- commitprompt:start -->')
    expect(agentSkill).toContain('name: commitprompt')
    expect(claudeSkill).toBe(agentSkill)

    const filesAfterFirstRun = await Promise.all([
      readFile(join(directory, 'package.json'), 'utf8'),
      readFile(agentsPath, 'utf8'),
      readFile(hookPath, 'utf8'),
      readFile(join(directory, '.github', 'copilot-instructions.md'), 'utf8'),
      readFile(agentSkillPath, 'utf8'),
      readFile(claudeSkillPath, 'utf8')
    ])
    const secondResult = await setupProject({
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(secondResult.changed).toBe(false)
    expect(secondResult.drift).toBe(false)
    expect(secondResult.actions.every(action => !action.changed)).toBe(true)
    await expect(Promise.all([
      readFile(join(directory, 'package.json'), 'utf8'),
      readFile(agentsPath, 'utf8'),
      readFile(hookPath, 'utf8'),
      readFile(join(directory, '.github', 'copilot-instructions.md'), 'utf8'),
      readFile(agentSkillPath, 'utf8'),
      readFile(claudeSkillPath, 'utf8')
    ])).resolves.toEqual(filesAfterFirstRun)
  })

  test('configures a repository and preserves obsolete prompt tooling', async () => {
    const directory = await createProject({
      config: {
        commitizen: {
          path: 'cz-conventional-changelog'
        }
      },
      devDependencies: {
        commitizen: '^4.3.1',
        czg: '^1.12.0'
      },
      name: 'consumer',
      packageManager: 'npm@11.4.2',
      scripts: {
        legacyCommit: 'git-cz',
        test: 'node --test'
      }
    })
    const agentsPath = join(directory, 'AGENTS.md')
    const hookPath = join(directory, 'quality.yml')

    await writeFile(agentsPath, '# Project guidance\n', 'utf8')
    await writeFile(
      hookPath, 'version: 1\nhooks:\n  pre-push:\n    steps:\n      - command: npm\n        args: [test]\n', 'utf8'
    )

    const firstResult = await setupProject({
      actions: qualitySetupActions,
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(firstResult).toEqual(expect.objectContaining({
      changed: true,
      drift: true,
      obsolete: [
        'dependency:commitizen',
        'dependency:czg',
        'package.json:config.commitizen',
        'package.json:scripts.legacyCommit'
      ],
      packageManager: 'npm'
    }))
    expect(firstResult.actions.map(action => action.id)).toEqual([
      'dependency',
      'commit-script',
      'quality-hook',
      'agents-instructions',
      'copilot-instructions',
      'agent-skill',
      'claude-skill'
    ])

    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    ) as {
      config: { commitizen: unknown }
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }

    expect(manifest.devDependencies).toEqual({
      '@santi020k/commitprompt': '^1.2.3',
      commitizen: '^4.3.1',
      czg: '^1.12.0'
    })
    expect(manifest.scripts).toEqual({
      commit: 'commitprompt',
      legacyCommit: 'git-cz',
      test: 'node --test'
    })
    expect(manifest.config.commitizen).toBeDefined()

    const hook = await readFile(hookPath, 'utf8')

    expect(hook).toContain('pre-push:')
    expect(hook).toContain('Validate commit message with Commitprompt')
    expect(hook).toContain('pass_hook_args: true')

    const agents = await readFile(agentsPath, 'utf8')
    const copilot = await readFile(
      join(directory, '.github', 'copilot-instructions.md'), 'utf8'
    )
    const agentSkillPath =
      join(directory, '.agents', 'skills', 'commitprompt', 'SKILL.md')
    const claudeSkillPath =
      join(directory, '.claude', 'skills', 'commitprompt', 'SKILL.md')
    const agentSkill = await readFile(agentSkillPath, 'utf8')
    const claudeSkill = await readFile(claudeSkillPath, 'utf8')

    expect(agents).toContain('# Project guidance')
    expect(agents).toContain('<!-- commitprompt:start -->')
    expect(copilot).toContain('<!-- commitprompt:start -->')
    expect(agentSkill).toContain('name: commitprompt')
    expect(claudeSkill).toBe(agentSkill)

    const filesAfterFirstRun = await Promise.all([
      readFile(join(directory, 'package.json'), 'utf8'),
      readFile(agentsPath, 'utf8'),
      readFile(hookPath, 'utf8'),
      readFile(join(directory, '.github', 'copilot-instructions.md'), 'utf8'),
      readFile(agentSkillPath, 'utf8'),
      readFile(claudeSkillPath, 'utf8')
    ])
    const secondResult = await setupProject({
      actions: qualitySetupActions,
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(secondResult.changed).toBe(false)
    expect(secondResult.drift).toBe(false)
    expect(secondResult.actions.every(action => !action.changed)).toBe(true)
    await expect(Promise.all([
      readFile(join(directory, 'package.json'), 'utf8'),
      readFile(agentsPath, 'utf8'),
      readFile(hookPath, 'utf8'),
      readFile(join(directory, '.github', 'copilot-instructions.md'), 'utf8'),
      readFile(agentSkillPath, 'utf8'),
      readFile(claudeSkillPath, 'utf8')
    ])).resolves.toEqual(filesAfterFirstRun)
  })

  test('preserves existing quality hook steps', async () => {
    const directory = await createProject({ name: 'consumer' })
    const hookPath = join(directory, 'quality.yml')

    await writeFile(
      hookPath,
      'version: 1\nhooks:\n  commit-msg:\n    steps:\n      - name: Check ticket\n        command: node\n        args: [scripts/check-ticket.mjs]\n',
      'utf8'
    )

    await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    const hook = await readFile(hookPath, 'utf8')

    expect(hook).toContain('Check ticket')
    expect(hook).toContain('Validate commit message with Commitprompt')
  })

  test('updates its hook in place while preserving shared steps and comments', async () => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const hookPath = join(directory, 'quality.yml')

    await writeFile(hookPath, `version: 1
hooks:
  pre-commit:
    steps:
      # Shared repository policy.
      - &ticket-check
        name: Check ticket
        command: node
        args: [scripts/check-ticket.mjs]
  commit-msg:
    steps:
      - *ticket-check
      - name: Validate commit message with Commitprompt
        command: npx
        args: [commitprompt]
        pass_hook_args: false
      - name: Inspect changes
        command: git
        args: [diff, --check]
`, 'utf8')

    const first = await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const source = await readFile(hookPath, 'utf8')
    const configuration: unknown = parseDocument(source).toJS()
    const ticketStep = {
      args: ['scripts/check-ticket.mjs'],
      command: 'node',
      name: 'Check ticket'
    }

    expect(first.actions).toEqual([{
      changed: true,
      id: 'quality-hook',
      path: hookPath
    }])
    expect(configuration).toEqual({
      hooks: {
        'commit-msg': {
          steps: [
            ticketStep,
            {
              args: ['exec', 'commitprompt', 'validate', '--input'],
              command: 'pnpm',
              name: 'Validate commit message with Commitprompt',
              pass_hook_args: true
            },
            {
              args: ['diff', '--check'],
              command: 'git',
              name: 'Inspect changes'
            }
          ]
        },
        'pre-commit': { steps: [ticketStep] }
      },
      version: 1
    })
    expect(source).toContain('# Shared repository policy.')
    expect(source).toContain('*ticket-check')

    await expect(setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(source)
  })

  test.each([
    { args: ['exec', 'commitprompt', 'validate', '--input'], command: 'pnpm', manager: 'pnpm' },
    { args: ['run', 'commitprompt', 'validate', '--input'], command: 'yarn', manager: 'yarn' }
  ])('uses the declared $manager executable for its quality hook', async ({ args, command, manager }) => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: `${manager}@1.0.0`
    })

    await writeFile(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')

    const result = await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const configuration: unknown = parseDocument(
      await readFile(join(directory, 'quality.yml'), 'utf8')
    ).toJS()

    expect(result.packageManager).toBe(manager)
    expect(configuration).toEqual({
      hooks: {
        'commit-msg': {
          steps: [{
            args,
            command,
            name: 'Validate commit message with Commitprompt',
            pass_hook_args: true
          }]
        }
      },
      version: 1
    })
  })

  test('detects Yarn from its lockfile when no package manager is declared', async () => {
    const directory = await createProject({ name: 'consumer' })

    await writeFile(join(directory, 'yarn.lock'), '# yarn lockfile v1\n')

    const result = await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(result.packageManager).toBe('yarn')
    await expect(readFile(join(directory, 'quality.yml'), 'utf8'))
      .resolves.toContain('command: yarn')
  })

  test('forwards validation flags and a spaced message path through Yarn Classic', async () => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'yarn@1.22.22',
      private: true
    })
    const binDirectory = join(directory, 'node_modules', '.bin')
    const recorder = `const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
writeFileSync(join(__dirname, 'received-arguments.json'), JSON.stringify(process.argv.slice(2)))
`

    await mkdir(binDirectory, { recursive: true })
    await writeFile(join(binDirectory, 'record-arguments.cjs'), recorder, 'utf8')
    await writeFile(
      join(binDirectory, 'commitprompt.cmd'),
      `@echo off\r\n"${process.execPath}" "%~dp0record-arguments.cjs" %*\r\n`,
      'utf8'
    )
    await writeFile(join(binDirectory, 'commitprompt'), `#!/usr/bin/env node\n${recorder}`, 'utf8')
    await chmod(join(binDirectory, 'commitprompt'), 0o755)
    await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    const document = parseDocument(await readFile(join(directory, 'quality.yml'), 'utf8'))
    const argumentsNode = document.getIn(['hooks', 'commit-msg', 'steps', 0, 'args'], true)

    if (!isSeq(argumentsNode)) throw new TypeError('Expected a hook argument sequence.')

    const hookArguments = argumentsNode.items.map((item: unknown) => {
      if (!isScalar(item) || typeof item.value !== 'string') {
        throw new TypeError('Expected string hook arguments.')
      }

      return item.value
    })
    const messagePath = join(directory, 'COMMIT MESSAGE')

    await writeFile(messagePath, 'feat: validate a real hook argument\n', 'utf8')

    const yarnPath = createRequire(import.meta.url).resolve('yarn/bin/yarn.js')
    const result = spawnSync(process.execPath, [yarnPath, ...hookArguments, messagePath], {
      cwd: directory,
      encoding: 'utf8'
    })

    expect(result.error).toBeUndefined()
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)

    const received: unknown = JSON.parse(
      await readFile(join(binDirectory, 'received-arguments.json'), 'utf8')
    )

    expect(received).toEqual(['validate', '--input', messagePath])
  })

  test('rejects malformed quality configuration before writing other setup files', async () => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const hookPath = join(directory, 'quality.yml')
    const invalidHook = 'version: 1\nhooks: [\n'
    const agentsPath = join(directory, 'AGENTS.md')

    await writeFile(hookPath, invalidHook, 'utf8')
    await writeFile(agentsPath, '# Preserve repository guidance\n', 'utf8')

    await expect(setupProject({
      actions: qualitySetupActions,
      cwd: directory,
      packageVersion: '1.2.3'
    })).rejects.toThrow('Cannot update invalid quality configuration')
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(invalidHook)
    await expect(readFile(agentsPath, 'utf8'))
      .resolves.toBe('# Preserve repository guidance\n')
    await expect(pathExists(join(directory, '.github', 'copilot-instructions.md')))
      .resolves.toBe(false)
  })

  test('propagates an unreadable quality configuration without applying partial setup', async () => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')

    await mkdir(join(directory, 'quality.yml'))

    await expect(setupProject({
      actions: qualitySetupActions,
      cwd: directory,
      packageVersion: '1.2.3'
    })).rejects.toMatchObject({ code: 'EISDIR' })
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(pathExists(join(directory, 'AGENTS.md'))).resolves.toBe(false)
  })

  test('reports pnpm drift without writing during a dry run', async () => {
    const directory = await createProject({
      name: 'consumer',
      private: true
    })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')

    await writeFile(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')

    const result = await setupProject({
      cwd: directory,
      dryRun: true,
      packageVersion: '1.2.3'
    })

    expect(result).toEqual(expect.objectContaining({
      changed: false,
      drift: true,
      packageManager: 'pnpm'
    }))
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(pathExists(join(directory, '.husky', 'commit-msg')))
      .resolves.toBe(false)
    await expect(pathExists(join(directory, 'AGENTS.md'))).resolves.toBe(false)
  })

  test('uses and maintains the pnpm workspace catalog', async () => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'pnpm@10.32.1',
      private: true
    })
    const workspacePath = join(directory, 'pnpm-workspace.yaml')

    await writeFile(
      workspacePath, `packages:
  - "packages/*"

catalog:
  typescript: ^6.0.3
`, 'utf8'
    )

    const first = await setupProject({
      actions: ['dependency'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    ) as { devDependencies: Record<string, string> }
    const workspace = await readFile(workspacePath, 'utf8')

    expect(first.drift).toBe(true)
    expect(first.actions).toEqual([{
      changed: true,
      id: 'dependency',
      path: join(directory, 'package.json')
    }])
    expect(manifest.devDependencies['@santi020k/commitprompt'])
      .toBe('catalog:')
    expect(workspace).toContain(
      '"@santi020k/commitprompt": ^1.2.3'
    )

    await expect(setupProject({
      actions: ['dependency'],
      check: true,
      cwd: directory,
      packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({ drift: false }))
  })

  test('repairs a missing default catalog entry without changing named catalogs', async () => {
    const directory = await createProject({
      devDependencies: { '@santi020k/commitprompt': 'catalog:' },
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const workspacePath = join(directory, 'pnpm-workspace.yaml')

    await writeFile(workspacePath, `packages:
  - packages/*
catalog: # Shared dependencies
catalogs:
  previous:
    "@santi020k/commitprompt": ^0.9.0
`, 'utf8')

    const result = await setupProject({
      actions: ['dependency'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const workspace = await readFile(workspacePath, 'utf8')
    const configuration: unknown = parseDocument(workspace).toJS()

    expect(result.actions).toEqual([{
      changed: true,
      id: 'dependency',
      path: workspacePath
    }])
    expect(configuration).toEqual({
      catalog: { '@santi020k/commitprompt': '^1.2.3' },
      catalogs: { previous: { '@santi020k/commitprompt': '^0.9.0' } },
      packages: ['packages/*']
    })
    expect(workspace).toContain('# Shared dependencies')
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(setupProject({
      actions: ['dependency'],
      check: true,
      cwd: directory,
      packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
  })

  test.each([
    { check: true },
    { dryRun: true }
  ])('reports catalog-only drift without writing files with %j', async mode => {
    const directory = await createProject({
      devDependencies: { '@santi020k/commitprompt': 'catalog:' },
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const workspacePath = join(directory, 'pnpm-workspace.yaml')
    const originalWorkspace = 'catalog:\n  typescript: ^6.0.3\n'

    await writeFile(workspacePath, originalWorkspace, 'utf8')

    const result = await setupProject({
      ...mode,
      actions: ['dependency'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(result).toEqual({
      actions: [{ changed: true, id: 'dependency', path: workspacePath }],
      changed: false,
      drift: true,
      obsolete: [],
      packageManager: 'pnpm'
    })
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(readFile(workspacePath, 'utf8')).resolves.toBe(originalWorkspace)
  })

  test('reports the manifest when moving a catalog dependency into development dependencies', async () => {
    const directory = await createProject({
      dependencies: { '@santi020k/commitprompt': 'catalog:' },
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const manifestPath = join(directory, 'package.json')
    const workspacePath = join(directory, 'pnpm-workspace.yaml')

    await writeFile(workspacePath, 'catalog:\n  typescript: ^6.0.3\n', 'utf8')

    const result = await setupProject({
      actions: ['dependency'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(result.actions).toEqual([{
      changed: true,
      id: 'dependency',
      path: manifestPath
    }])
    const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))

    expect(manifest).toEqual({
      dependencies: {},
      devDependencies: { '@santi020k/commitprompt': 'catalog:' },
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    await expect(readFile(workspacePath, 'utf8'))
      .resolves.toContain('"@santi020k/commitprompt": ^1.2.3')
  })

  test.each([
    'catalog: {} # Shared dependencies\n',
    'catalog: { typescript: ^6.0.3 } # Shared dependencies\n',
    'catalog: { typescript: ^6.0.3, } # Shared dependencies\n',
    '"catalog": {\n  # Shared dependencies\n  typescript: ^6.0.3\n}\n',
    '"catalog":\n  # Shared dependencies\n  typescript: ^6.0.3\n',
    'catalog: # Shared dependencies\n',
    'catalog: # Shared dependencies\r\n',
    'catalog:\r\n  typescript: ^6.0.3 # Shared dependencies\r\n'
  ])('repairs supported catalog syntax without changing unrelated YAML: %j', async catalogSource => {
    const directory = await createProject({
      devDependencies: { '@santi020k/commitprompt': 'catalog:' },
      packageManager: 'pnpm@10.32.1'
    })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const workspacePath = join(directory, 'pnpm-workspace.yaml')
    const newline = catalogSource.includes('\r\n') ? '\r\n' : '\n'
    const namedCatalogs = `catalogs:${newline}  previous: { "@santi020k/commitprompt": ^0.9.0 }${newline}`
    const originalWorkspace = `${catalogSource}${namedCatalogs}`

    await writeFile(workspacePath, originalWorkspace, 'utf8')

    for (const mode of [{ check: true }, { dryRun: true }]) {
      const result = await setupProject({
        ...mode,
        actions: ['dependency'],
        cwd: directory,
        packageVersion: '1.2.3'
      })

      expect(result.actions).toEqual([{
        changed: true, id: 'dependency', path: workspacePath
      }])
      expect(result.changed).toBe(false)
      expect(result.drift).toBe(true)
      await expect(readFile(workspacePath, 'utf8')).resolves.toBe(originalWorkspace)
    }

    await setupProject({ actions: ['dependency'], cwd: directory, packageVersion: '1.2.3' })

    const updatedWorkspace = await readFile(workspacePath, 'utf8')
    const expectedCatalog: Record<string, string> = { '@santi020k/commitprompt': '^1.2.3' }

    if (catalogSource.includes('typescript')) expectedCatalog.typescript = '^6.0.3'

    expect(parseDocument(updatedWorkspace).toJS()).toEqual(expect.objectContaining({ catalog: expectedCatalog }))
    expect(updatedWorkspace).toContain('# Shared dependencies')
    expect(updatedWorkspace).toContain(namedCatalogs)
    expect(updatedWorkspace.replaceAll(newline, '')).not.toContain('\n')
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(setupProject({ actions: ['dependency'], check: true, cwd: directory }))
      .resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
  })

  test.each([
    'catalog: { typescript: [ }\n',
    'catalog: {}\ncatalog: {}\n',
    '- catalog\n',
    'catalog: []\n',
    'catalog: null\n',
    'catalog: invalid\n',
    'catalog: { typescript: 123 }\n',
    'catalog: &shared { typescript: ^6.0.3 }\ncatalogs: { previous: *shared }\n',
    'catalogs: { previous: &shared { typescript: ^6.0.3 } }\ncatalog: *shared\n'
  ])('rejects invalid or shared catalog repairs before writing: %j', async workspace => {
    const directory = await createProject({ packageManager: 'pnpm@10.32.1' })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const workspacePath = join(directory, 'pnpm-workspace.yaml')

    await writeFile(workspacePath, workspace, 'utf8')
    await expect(setupProject({ cwd: directory, packageVersion: '1.2.3' }))
      .rejects.toThrow(/pnpm (?:workspace configuration|catalog)/u)
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(readFile(workspacePath, 'utf8')).resolves.toBe(workspace)
    await expect(pathExists(join(directory, 'AGENTS.md'))).resolves.toBe(false)
    await expect(pathExists(join(directory, 'quality.yml'))).resolves.toBe(false)
  })

  test('preserves an existing catalog entry shared through an alias', async () => {
    const directory = await createProject({
      devDependencies: { '@santi020k/commitprompt': 'catalog:' },
      packageManager: 'pnpm@10.32.1'
    })
    const workspacePath = join(directory, 'pnpm-workspace.yaml')
    const workspace = 'catalogs: { previous: &shared { "@santi020k/commitprompt": ^0.9.0 } }\ncatalog: *shared\n'

    await writeFile(workspacePath, workspace, 'utf8')
    await expect(setupProject({ actions: ['dependency'], cwd: directory }))
      .resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
    await expect(readFile(workspacePath, 'utf8')).resolves.toBe(workspace)
  })

  test('keeps a workspace without a default catalog unchanged', async () => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const workspacePath = join(directory, 'pnpm-workspace.yaml')
    const workspace = 'packages:\n  - packages/*\n'

    await writeFile(workspacePath, workspace, 'utf8')
    await setupProject({
      actions: ['dependency'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const manifest: unknown = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    )

    expect(manifest).toEqual({
      devDependencies: { '@santi020k/commitprompt': '^1.2.3' },
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    await expect(readFile(workspacePath, 'utf8')).resolves.toBe(workspace)
  })

  test('preserves an existing dependency range instead of migrating it to a catalog', async () => {
    const directory = await createProject({
      devDependencies: { '@santi020k/commitprompt': '~1.0.0' },
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const workspacePath = join(directory, 'pnpm-workspace.yaml')
    const workspace = 'catalog:\n  typescript: ^6.0.3\n'

    await writeFile(workspacePath, workspace, 'utf8')

    await expect(setupProject({
      actions: ['dependency'],
      cwd: directory,
      packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
    await expect(readFile(workspacePath, 'utf8')).resolves.toBe(workspace)
  })

  test('uses the installed package version when none is supplied', async () => {
    const directory = await createProject({ name: 'consumer' })
    const metadata: unknown = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    )

    if (
      typeof metadata !== 'object' || metadata === null ||
      !('version' in metadata) || typeof metadata.version !== 'string'
    ) {
      throw new Error('The installed package must declare its version.')
    }

    await setupProject({ actions: ['dependency'], cwd: directory })

    const manifest: unknown = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    )

    expect(manifest).toEqual({
      devDependencies: { '@santi020k/commitprompt': `^${metadata.version}` },
      name: 'consumer'
    })
  })

  test('applies selected actions without changing unrelated setup', async () => {
    const directory = await createProject({
      dependencies: {
        '@santi020k/commitprompt': '~0.9.0'
      },
      devDependencies: {
        husky: '^8.0.0'
      },
      name: 'consumer',
      scripts: {
        prepare: 'husky install',
        test: 'node --test'
      }
    })

    const result = await setupProject({
      actions: ['dependency'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    ) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }

    expect(result.actions).toEqual([{
      changed: true,
      id: 'dependency',
      path: join(directory, 'package.json')
    }])
    expect(manifest.dependencies).toEqual({})
    expect(manifest.devDependencies).toEqual({
      '@santi020k/commitprompt': '~0.9.0',
      husky: '^8.0.0'
    })
    expect(manifest.scripts).toEqual({
      prepare: 'husky install',
      test: 'node --test'
    })
    await expect(pathExists(join(directory, '.husky', 'commit-msg')))
      .resolves.toBe(false)
    await expect(pathExists(join(directory, 'AGENTS.md'))).resolves.toBe(false)
  })

  test('preserves unrelated legacy setup when the quality hook is selected', async () => {
    const directory = await createProject({
      devDependencies: {
        husky: '^8.0.0'
      },
      name: 'consumer',
      scripts: {
        prepare: 'node scripts/prepare.mjs && husky install'
      }
    })

    await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    ) as {
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }

    expect(manifest.devDependencies.husky).toBe('^8.0.0')
    expect(manifest.scripts.prepare).toBe('node scripts/prepare.mjs && husky install')
    await expect(readFile(join(directory, 'quality.yml'), 'utf8'))
      .resolves.toContain('Validate commit message with Commitprompt')
  })

  test('preserves unrelated workspace catalog dependencies', async () => {
    const directory = await createProject({
      devDependencies: { husky: 'catalog:' },
      name: 'consumer',
      scripts: { prepare: 'husky' }
    })

    await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    ) as { devDependencies: Record<string, string> }

    expect(manifest.devDependencies.husky).toBe('catalog:')
  })

  test('does not change an unrelated prepare script', async () => {
    const directory = await createProject({
      name: 'consumer',
      scripts: { prepare: 'node scripts/prepare.mjs' }
    })

    await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> }

    expect(manifest.scripts.prepare).toBe('node scripts/prepare.mjs')
  })

  test('rejects an empty project action selection', async () => {
    const directory = await createProject({ name: 'consumer' })

    await expect(setupProject({
      actions: [],
      cwd: directory,
      packageVersion: '1.2.3'
    })).rejects.toThrow('Project setup requires at least one action.')
  })

  test('uses check mode to detect and clear repository drift', async () => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'yarn@4.9.2'
    })

    await expect(setupProject({
      check: true,
      cwd: directory,
      packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({
      changed: false,
      drift: true,
      packageManager: 'yarn'
    }))

    await setupProject({
      cwd: directory,
      packageVersion: '1.2.3'
    })

    await expect(setupProject({
      check: true,
      cwd: directory,
      packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({
      changed: false,
      drift: false,
      packageManager: 'yarn'
    }))
  })

  test.each([
    { indent: '\t', newline: '' },
    { indent: '\t', newline: '\n' },
    { indent: '    ', newline: '' },
    { indent: '    ', newline: '\n' },
    { indent: '\t', newline: '', lineEnding: '\r\n' },
    { indent: '\t', newline: '\r\n', lineEnding: '\r\n' },
    { indent: '    ', newline: '', lineEnding: '\r\n' },
    { indent: '    ', newline: '\r\n', lineEnding: '\r\n' }
  ])('preserves indentation and trailing newline when updating a manifest: %j', async ({ indent, newline, lineEnding = '\n' }) => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')
    const source = `{${lineEnding}${indent}"name": "consumer"${lineEnding}}${newline}`

    await writeFile(manifestPath, source, 'utf8')

    const result = await setupProject({
      actions: ['commit-script'], cwd: directory, packageVersion: '1.2.3'
    })
    const updated = await readFile(manifestPath, 'utf8')
    const manifest: unknown = JSON.parse(updated)

    expect(result.changed).toBe(true)
    expect(manifest).toEqual({ name: 'consumer', scripts: { commit: 'commitprompt' } })
    expect(updated).toContain(`${lineEnding}${indent}"name": "consumer"`)
    expect(updated).toContain(`${lineEnding}${indent}"scripts": {${lineEnding}${indent}${indent}"commit": "commitprompt"`)
    expect(updated.endsWith('\n')).toBe(newline.length > 0)
    expect(updated.replaceAll(lineEnding, '')).not.toContain('\n')
  })

  test.each([
    ['quality-hook'],
    ['agents-instructions'],
    ['dependency', 'commit-script']
  ] as const)('preserves manifest formatting for unchanged manifest actions %j', async (...actions) => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')
    const source = '{"name":"consumer","devDependencies":{"@santi020k/commitprompt":"^1.2.3"},"scripts":{"commit":"commitprompt"}}'

    await writeFile(manifestPath, source, 'utf8')
    await setupProject({ actions, cwd: directory, packageVersion: '1.2.3' })
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(source)

    await expect(setupProject({
      actions, cwd: directory, packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(source)
  })

  test.each([
    { scripts: { test: 1 } },
    { scripts: null },
    { scripts: [] },
    { dependencies: 'invalid' },
    { dependencies: { example: false } },
    { devDependencies: ['example'] },
    { devDependencies: { example: null } },
    { packageManager: 42 },
    { config: [] },
    { config: null }
  ])('rejects malformed manifest fields before writing: %j', async fields => {
    const directory = await createProject({ name: 'consumer', ...fields })
    const manifestPath = join(directory, 'package.json')
    const source = await readFile(manifestPath, 'utf8')
    const agentsPath = join(directory, 'AGENTS.md')
    const guidance = '# Preserve project guidance\n'

    await writeFile(agentsPath, guidance, 'utf8')
    await expect(setupProject({
      cwd: directory, packageVersion: '1.2.3'
    })).rejects.toThrow('Invalid package manifest field')
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(source)
    await expect(readFile(agentsPath, 'utf8')).resolves.toBe(guidance)
    await expect(pathExists(join(directory, 'quality.yml'))).resolves.toBe(false)
    await expect(pathExists(join(directory, '.github'))).resolves.toBe(false)
  })

  test.each([
    '<!-- commitprompt:end -->\nProject guidance\n',
    '<!-- commitprompt:end -->\n<!-- commitprompt:start -->\n',
    '<!-- commitprompt:start -->\n<!-- commitprompt:start -->\n<!-- commitprompt:end -->\n',
    '<!-- commitprompt:start -->\n<!-- commitprompt:end -->\n<!-- commitprompt:end -->\n'
  ])('refuses malformed guarded instructions without writing: %j', async source => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')
    const manifestSource = await readFile(manifestPath, 'utf8')
    const agentsPath = join(directory, 'AGENTS.md')

    await writeFile(agentsPath, source, 'utf8')
    await expect(setupProject({
      cwd: directory, packageVersion: '1.2.3'
    })).rejects.toThrow('Cannot update an incomplete guarded section')
    await expect(readFile(agentsPath, 'utf8')).resolves.toBe(source)
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(manifestSource)
    await expect(pathExists(join(directory, 'quality.yml'))).resolves.toBe(false)
  })

  test('rejects an invalid package manifest without writing', async () => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')

    await writeFile(manifestPath, '{ invalid', 'utf8')

    await expect(setupProject({
      cwd: directory,
      packageVersion: '1.2.3'
    })).rejects.toThrow('Cannot update invalid package manifest')
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe('{ invalid')
  })

  test.each(['null', '[]', '"consumer"', '42'])(
    'rejects a non-object package manifest %s without writing', async source => {
      const directory = await createProject({ name: 'consumer' })
      const manifestPath = join(directory, 'package.json')

      await writeFile(manifestPath, source, 'utf8')

      await expect(setupProject({
        cwd: directory,
        packageVersion: '1.2.3'
      })).rejects.toThrow('Package manifest must contain an object')
      await expect(readFile(manifestPath, 'utf8')).resolves.toBe(source)
      await expect(pathExists(join(directory, 'quality.yml'))).resolves.toBe(false)
    }
  )

  test('refuses to replace an incomplete guarded instruction section', async () => {
    const directory = await createProject({ name: 'consumer' })
    const agentsPath = join(directory, 'AGENTS.md')

    await writeFile(
      agentsPath, '<!-- commitprompt:start -->\nIncomplete instructions\n', 'utf8'
    )

    await expect(setupProject({
      actions: ['agents-instructions'],
      cwd: directory,
      packageVersion: '1.2.3'
    })).rejects.toThrow('Cannot update an incomplete guarded section')
    await expect(readFile(agentsPath, 'utf8')).resolves.toContain(
      'Incomplete instructions'
    )
  })

  test('leaves an already-correct hand-authored hook step untouched', async () => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const hookPath = join(directory, 'quality.yml')
    const source = `version: 1
hooks:
  commit-msg:
    steps:
      # keep retries low
      - name: Validate commit message with Commitprompt
        command: pnpm
        args: [exec, commitprompt, validate, --input]
        pass_hook_args: true
        timeout: 30
`

    await writeFile(hookPath, source, 'utf8')

    const result = await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(result.actions).toEqual([{ changed: false, id: 'quality-hook', path: hookPath }])
    expect(result.drift).toBe(false)
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(source)
  })

  test.each(['>', '|'])('matches a block name %s without adding a duplicate', async blockStyle => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const hookPath = join(directory, 'quality.yml')
    const source = `version: 1
hooks:
  commit-msg:
    steps:
      - name: ${blockStyle}
          Validate commit message with Commitprompt
        command: pnpm
        args: [exec, commitprompt, validate, --input]
        pass_hook_args: true
`

    await writeFile(hookPath, source, 'utf8')

    const result = await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    expect(result.actions).toEqual([{ changed: false, id: 'quality-hook', path: hookPath }])
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(source)
    expect(source.match(/Validate commit message with Commitprompt/gu)).toHaveLength(1)

    await expect(setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(source)
  })

  test('updates a stale hook step in place while preserving its comment and unknown fields', async () => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const hookPath = join(directory, 'quality.yml')
    const source = `version: 1
hooks:
  commit-msg:
    steps:
      # keep retries low
      - name: Validate commit message with Commitprompt
        command: npx
        args: [commitprompt] # preserve arguments note
        pass_hook_args: false
        timeout: 30 # preserve timeout note
`

    await writeFile(hookPath, source, 'utf8')

    const result = await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const updated = await readFile(hookPath, 'utf8')
    const configuration: unknown = parseDocument(updated).toJS()

    expect(result.actions).toEqual([{ changed: true, id: 'quality-hook', path: hookPath }])
    expect(configuration).toEqual({
      hooks: {
        'commit-msg': {
          steps: [{
            args: ['exec', 'commitprompt', 'validate', '--input'],
            command: 'pnpm',
            name: 'Validate commit message with Commitprompt',
            pass_hook_args: true,
            timeout: 30
          }]
        }
      },
      version: 1
    })
    expect(updated).toContain('# keep retries low')
    expect(updated).toContain('# preserve arguments note')
    expect(updated).toContain('# preserve timeout note')
    expect(updated.match(/Validate commit message with Commitprompt/gu)).toHaveLength(1)

    await expect(setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(updated)
  })

  test('preserves CRLF line endings when writing a new quality hook step', async () => {
    const directory = await createProject({
      name: 'consumer',
      packageManager: 'pnpm@10.32.1'
    })
    const hookPath = join(directory, 'quality.yml')

    await writeFile(
      hookPath,
      'version: 1\r\nhooks:\r\n  commit-msg:\r\n    steps:\r\n' +
      '      - name: Check ticket\r\n        command: node\r\n        args: [scripts/check-ticket.mjs]\r\n',
      'utf8'
    )

    await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })

    const updated = await readFile(hookPath, 'utf8')

    expect(updated).toContain('Validate commit message with Commitprompt')
    expect(updated.replaceAll('\r\n', '')).not.toContain('\n')
  })

  test.each([
    'disabled\n',
    '[]\n',
    'null\n',
    'version: 1\nhooks: null\n',
    'version: 1\nhooks:\n  commit-msg: null\n',
    'version: 1\nhooks:\n  commit-msg:\n    steps: null\n',
    'version: 1\nhooks:\n  commit-msg:\n    steps: disabled\n',
    'version: 1\nhooks:\n  commit-msg:\n    steps:\n      foo: bar\n',
    'version: 1\nhooks:\n  commit-msg: disabled\n',
    'version: 1\nhooks: disabled\n'
  ])('rejects a malformed quality hook shape without overwriting it: %j', async source => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const hookPath = join(directory, 'quality.yml')

    await writeFile(hookPath, source, 'utf8')
    await expect(setupProject({
      actions: ['commit-script', 'quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })).rejects.toThrow('Cannot update invalid quality configuration')
    await expect(readFile(hookPath, 'utf8')).resolves.toBe(source)
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(originalManifest)
  })

  test('preserves CRLF line endings when updating package.json', async () => {
    const directory = await createProject({ name: 'consumer' })
    const manifestPath = join(directory, 'package.json')
    const source = '{\r\n  "name": "consumer"\r\n}\r\n'

    await writeFile(manifestPath, source, 'utf8')

    const result = await setupProject({
      actions: ['commit-script'], cwd: directory, packageVersion: '1.2.3'
    })
    const updated = await readFile(manifestPath, 'utf8')
    const manifest: unknown = JSON.parse(updated)

    expect(result.changed).toBe(true)
    expect(manifest).toEqual({ name: 'consumer', scripts: { commit: 'commitprompt' } })
    expect(updated).toContain('\r\n  "scripts": {\r\n    "commit": "commitprompt"\r\n  }\r\n')
    expect(updated.replaceAll('\r\n', '')).not.toContain('\n')

    await expect(setupProject({
      actions: ['commit-script'], cwd: directory, packageVersion: '1.2.3'
    })).resolves.toEqual(expect.objectContaining({ changed: false, drift: false }))
    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(updated)
  })

  test('writes an idempotent Commitprompt step into quality.yml', async () => {
    const directory = await createProject({ name: 'consumer', private: true })

    await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const first = await readFile(join(directory, 'quality.yml'), 'utf8')

    await setupProject({
      actions: ['quality-hook'],
      cwd: directory,
      packageVersion: '1.2.3'
    })
    const second = await readFile(join(directory, 'quality.yml'), 'utf8')

    expect(second).toBe(first)
    expect(second.match(/Validate commit message with Commitprompt/gu))
      .toHaveLength(1)
    expect(second).toContain('pass_hook_args: true')
  })
})
