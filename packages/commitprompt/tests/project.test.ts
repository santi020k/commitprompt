import { spawnSync } from 'node:child_process'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, test } from 'vitest'

import { setupProject } from '../src/project.js'

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

  test('upgrades legacy Husky setup when the hook action is selected', async () => {
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

    expect(manifest.devDependencies.husky).toBe('^9.1.7')
    expect(manifest.scripts.prepare).toBe('node scripts/prepare.mjs && husky')
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

  test.skipIf(process.platform === 'win32')(
    'enforces valid and invalid messages through a real Husky hook', async () => {
      const directory = await createProject({ name: 'consumer', private: true })
      const binaryDirectory = join(directory, 'test-bin')
      const commitpromptBinary = join(binaryDirectory, 'commitprompt')
      const builtBinary = resolve(
        import.meta.dirname, '../dist/bin/commitprompt.js'
      )
      const huskyBinary = resolve(
        import.meta.dirname, '../../../node_modules/.bin/husky'
      )

      await mkdir(binaryDirectory)
      await writeFile(
        commitpromptBinary, `#!/bin/sh
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(builtBinary)} "$@"
`, 'utf8'
      )
      await chmod(commitpromptBinary, 0o755)

      for (const arguments_ of [
        ['init', '--quiet'],
        ['config', 'user.name', 'Commitprompt Tests'],
        ['config', 'user.email', 'tests@commitprompt.dev']
      ]) {
        expect(spawnSync('git', arguments_, { cwd: directory }).status).toBe(0)
      }

      await setupProject({
        actions: ['husky-hook'],
        cwd: directory,
        packageVersion: '1.2.3'
      })

      expect(spawnSync(huskyBinary, [], { cwd: directory }).status).toBe(0)

      const hookEnvironment = {
        ...process.env,
        PATH: `${binaryDirectory}:${String(process.env.PATH)}`
      }

      await writeFile(join(directory, 'valid.txt'), 'valid\n', 'utf8')
      expect(spawnSync('git', ['add', 'valid.txt'], {
        cwd: directory,
        env: hookEnvironment
      }).status).toBe(0)

      const validCommit = spawnSync(
        'git', ['commit', '--message', 'feat: accept valid hook message'], {
          cwd: directory,
          encoding: 'utf8',
          env: hookEnvironment
        }
      )

      expect(validCommit.status).toBe(0)

      await writeFile(join(directory, 'invalid.txt'), 'invalid\n', 'utf8')
      expect(spawnSync('git', ['add', 'invalid.txt'], {
        cwd: directory,
        env: hookEnvironment
      }).status).toBe(0)

      const invalidCommit = spawnSync(
        'git', ['commit', '--message', 'invalid message'], {
          cwd: directory,
          encoding: 'utf8',
          env: hookEnvironment
        }
      )

      expect(invalidCommit.status).toBe(1)
      expect(`${invalidCommit.stdout}${invalidCommit.stderr}`)
        .toContain('Commit blocked:')
    }
  )
})
