import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
    const hookPath = join(directory, 'quality.yml')

    await writeFile(agentsPath, '# Project guidance\n', 'utf8')
    await writeFile(
      hookPath, 'version: 1\nhooks:\n  pre-push:\n    steps:\n      - command: npm\n        args: [test]\n', 'utf8'
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
