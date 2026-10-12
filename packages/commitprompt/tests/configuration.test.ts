import { spawnSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, test } from 'vitest'

import {
  configurationInternals,
  loadCommitlintConfiguration
} from '../src/configuration.js'
import { createCommitlintValidator } from '../src/validator.js'

const temporaryDirectories: string[] = []

const runNativeConfiguration = (directory: string) => spawnSync(
  process.execPath,
  ['--input-type=module',
    '--eval',
    `const { loadCommitlintConfiguration } = await import(${JSON.stringify(new URL('../src/configuration.ts', import.meta.url).href)});
const loaded = await loadCommitlintConfiguration(process.cwd());
process.stdout.write(JSON.stringify(loaded.rules));`
  ],
  { cwd: directory, encoding: 'utf8', timeout: 5000 }
)

const createProject = async (
  resolveWorkspacePackages = false
): Promise<string> => {
  const parent = resolveWorkspacePackages ? import.meta.dirname : tmpdir()
  const directory = await mkdtemp(join(parent, 'commitprompt-configuration-'))

  temporaryDirectories.push(directory)
  await writeFile(
    join(directory, 'package.json'), '{"name":"configuration-test","private":true,"type":"module"}\n', 'utf8'
  )

  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      force: true,
      recursive: true
    }))
  )
})

describe('loadCommitlintConfiguration', () => {
  test('returns an empty qualified configuration without a repository file', async () => {
    const directory = await createProject()
    const configuration = await loadCommitlintConfiguration(directory)

    expect(configuration).toEqual(expect.objectContaining({
      extends: [],
      plugins: {},
      prompt: {},
      rules: {}
    }))
  })

  test.each(['ts', 'mts'])(
    'loads native erasable .%s configuration without TypeScript', async extension => {
      const directory = await createProject()

      await writeFile(
        join(directory, `commitlint.config.${extension}`), `const types: string[] = ['fix', 'release']

export default {
  rules: {
    'type-enum': [2, 'always', types]
  }
}
`, 'utf8'
      )

      const configuration = await loadCommitlintConfiguration(directory)

      expect(configuration.rules['type-enum'])
        .toEqual([2, 'always', ['fix', 'release']])
    }
  )

  test('loads native CommonJS TypeScript configuration', async () => {
    const directory = await createProject()

    await writeFile(
      join(directory, 'commitlint.config.cts'), `const types: string[] = ['fix', 'release']

module.exports = {
  rules: {
    'type-enum': [2, 'always', types]
  }
}
`, 'utf8'
    )

    const configuration = await loadCommitlintConfiguration(directory)

    expect(configuration.rules['type-enum'])
      .toEqual([2, 'always', ['fix', 'release']])
  })

  test.each([
    [
      '.commitlintrc.json',
      '{"rules":{"type-enum":[2,"always",["fix","release"]]}}\n'
    ],
    [
      '.commitlintrc.yaml',
      `rules:
  type-enum:
    - 2
    - always
    - [fix, release]
`
    ]
  ])('loads %s configuration', async (filename, source) => {
    const directory = await createProject()

    await writeFile(join(directory, filename), source, 'utf8')

    const configuration = await loadCommitlintConfiguration(directory)

    expect(configuration.rules['type-enum'])
      .toEqual([2, 'always', ['fix', 'release']])
  })

  test('resolves extended rules and parser presets', async () => {
    const directory = await createProject(true)

    await writeFile(
      join(directory, 'commitlint.config.mjs'), `export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [0]
  }
}
`, 'utf8'
    )

    const configuration = await loadCommitlintConfiguration(directory)

    expect(configuration.extends)
      .toEqual(['@commitlint/config-conventional'])
    expect(configuration.rules['header-max-length']).toEqual([0])
    expect(configuration.rules['type-enum']).toBeDefined()
    expect(configuration.parserPreset?.parserOpts).toBeDefined()
  })

  test('resolves scoped shorthand through an import-only export', async () => {
    const directory = await createProject()
    const configurationDirectory =
      join(directory, 'node_modules', '@scope', 'commitlint-config')

    await mkdir(configurationDirectory, { recursive: true })
    await writeFile(
      join(configurationDirectory, 'package.json'), '{"name":"@scope/commitlint-config","type":"module","exports":{".":{"import":"./index.js"}}}\n', 'utf8'
    )
    await writeFile(
      join(configurationDirectory, 'index.js'), `export default {
  rules: {
    'type-enum': [2, 'always', ['fix', 'release']]
  }
}
`, 'utf8'
    )
    await writeFile(
      join(directory, 'commitlint.config.mjs'), 'export default { extends: [\'@scope\'] }\n', 'utf8'
    )

    const configuration = await loadCommitlintConfiguration(directory)

    expect(configuration.rules['type-enum'])
      .toEqual([2, 'always', ['fix', 'release']])
  })

  test.each([
    ['./config.mjs'],
    [null, './config.mjs'],
    [[null], ['./config.mjs']],
    [42, './config.mjs'],
    ['invalid-target', './config.mjs'],
    ['./../outside.mjs', './config.mjs'],
    ['./node_modules/other.mjs', './config.mjs'],
    ['./%2e%2e/outside.mjs', './config.mjs'],
    ['./node_modules/other.mjs'.replaceAll('n', '%6e'), './config.mjs']
  ])('loads consumer import-only array exports like native Node: %j', async (...targets) => {
    const directory = await createProject()
    const configurationDirectory = join(directory, 'node_modules', 'commitlint-config-array')
    const rules = { 'type-enum': [2, 'always', ['fix', 'release']] }

    await mkdir(configurationDirectory, { recursive: true })
    await writeFile(join(configurationDirectory, 'package.json'), JSON.stringify({
      exports: { '.': { import: targets } },
      main: './wrong.mjs',
      name: 'commitlint-config-array',
      type: 'module'
    }), 'utf8')
    await writeFile(join(configurationDirectory, 'config.mjs'), `export default ${JSON.stringify({ rules })}\n`, 'utf8')
    await writeFile(join(configurationDirectory, 'wrong.mjs'), 'export default { rules: {} }\n', 'utf8')
    await writeFile(join(directory, 'commitlint.config.mjs'), 'export default { extends: ["array"] }\n', 'utf8')

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      'const loaded = await import("commitlint-config-array"); process.stdout.write(JSON.stringify(loaded.default))'
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })

    expect(native.status).toBe(0)
    expect(native.stderr).toBe('')
    const nativeConfiguration: unknown = JSON.parse(native.stdout)

    expect(nativeConfiguration).toEqual({ rules })
    const loaded = runNativeConfiguration(directory)

    expect(loaded.status).toBe(0)
    expect(loaded.stderr).toBe('')
    const loadedRules: unknown = JSON.parse(loaded.stdout)

    expect(loadedRules).toEqual(rules)
  })

  test.each([
    { target: './caf%C3%A9.mjs', filename: 'café.mjs', subpath: '' },
    { target: './space%20name.mjs', filename: 'space name.mjs', subpath: '' },
    { target: './percent%25.mjs', filename: 'percent%.mjs', subpath: '' },
    { target: './hash%23.mjs', filename: 'hash#.mjs', subpath: '' },
    // Windows does not permit question marks in filenames.
    ...(process.platform === 'win32' ? [] : [{ target: './query%3F.mjs', filename: 'query?.mjs', subpath: '' }]),
    { target: './*.mjs', filename: 'café.mjs', subpath: 'caf%C3%A9' }
  ])('loads URL-encoded exports like native Node: $target $subpath', async ({ target, filename, subpath }) => {
    const directory = await createProject()
    const packageDirectory = join(directory, 'node_modules', 'commitlint-config-encoded')
    const rules = { 'type-enum': [2, 'always', ['release']] }
    const specifier = `commitlint-config-encoded${subpath ? `/${subpath}` : ''}`

    await mkdir(packageDirectory, { recursive: true })
    await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({
      exports: subpath ? { './*': { import: target } } : { import: target },
      name: 'commitlint-config-encoded',
      type: 'module'
    }))
    await writeFile(join(packageDirectory, filename), `export default ${JSON.stringify({ rules })}\n`)
    await writeFile(join(directory, 'commitlint.config.mjs'), `export default { extends: [${JSON.stringify(specifier)}] }\n`)

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      `process.stdout.write(JSON.stringify((await import(${JSON.stringify(specifier)})).default.rules))`
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })
    const loaded = runNativeConfiguration(directory)

    expect(native.status).toBe(0)
    expect(native.stderr).toBe('')
    expect(loaded.status).toBe(0)
    expect(loaded.stderr).toBe('')
    expect(JSON.parse(loaded.stdout)).toEqual(JSON.parse(native.stdout))
    expect(configurationInternals.resolvePackageEntry(
      join(packageDirectory, 'package.json'), packageDirectory, subpath
    )).toBe(join(packageDirectory, filename))
  })

  test.each([
    { name: 'node before import', conditions: { node: './first.mjs', import: './second.mjs' }, expected: 'first.mjs' },
    { name: 'default before import', conditions: { default: './first.mjs', import: './second.mjs' }, expected: 'first.mjs' },
    { name: 'nested conditions', conditions: { node: { browser: './second.mjs', import: './first.mjs' }, import: './second.mjs' }, expected: 'first.mjs' },
    { name: 'inactive module condition', conditions: { module: './second.mjs', import: './first.mjs' }, expected: 'first.mjs' },
    { name: 'unmatched nested condition', conditions: { node: { browser: './second.mjs' }, import: './first.mjs' }, expected: 'first.mjs' },
    { name: 'inactive array conditions', conditions: { node: [{ browser: './second.mjs' }], import: './first.mjs' }, expected: 'first.mjs' },
    { name: 'nested inactive arrays', conditions: { node: [[{ browser: './second.mjs' }]], import: './first.mjs' }, expected: 'first.mjs' },
    { name: 'null in inactive array blocks siblings', conditions: { node: [null, { browser: './first.mjs' }], import: './second.mjs' }, expected: undefined },
    { name: 'null blocks siblings', conditions: { node: null, import: './second.mjs' }, expected: undefined },
    { name: 'empty array blocks siblings', conditions: { node: [], import: './second.mjs' }, expected: undefined },
    { name: 'invalid target blocks siblings', conditions: { node: 'invalid', import: './second.mjs' }, expected: undefined },
    { name: 'module-only condition', conditions: { module: './second.mjs' }, expected: undefined }
  ])('selects conditional exports like native Node: $name', async ({ conditions, expected }) => {
    const directory = await createProject()
    const packageDirectory = join(directory, 'node_modules', 'condition-order')

    await mkdir(packageDirectory, { recursive: true })
    await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({
      exports: conditions,
      name: 'condition-order',
      type: 'module'
    }))
    await writeFile(join(packageDirectory, 'first.mjs'), 'export default "first.mjs"')
    await writeFile(join(packageDirectory, 'second.mjs'), 'export default "second.mjs"')

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      'process.stdout.write((await import("condition-order")).default)'
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })

    expect(native.status).toBe(expected === undefined ? 1 : 0)
    expect(configurationInternals.resolvePackageEntry(
      join(packageDirectory, 'package.json'), packageDirectory, ''
    )).toBe(expected === undefined ? undefined : join(packageDirectory, native.stdout))
    expect(native.stdout).toBe(expected ?? '')
  })

  test('does not skip a valid array target because its file is missing', async () => {
    const directory = await createProject()
    const configurationDirectory = join(directory, 'node_modules', 'commitlint-config-missing-array')

    await mkdir(configurationDirectory, { recursive: true })
    await writeFile(join(configurationDirectory, 'package.json'), JSON.stringify({
      exports: { '.': { import: ['./missing.mjs', './config.mjs'] } },
      main: './config.mjs',
      name: 'commitlint-config-missing-array',
      type: 'module'
    }), 'utf8')
    await writeFile(join(configurationDirectory, 'config.mjs'), 'export default { rules: {} }\n', 'utf8')
    await writeFile(join(directory, 'commitlint.config.mjs'), 'export default { extends: ["missing-array"] }\n', 'utf8')

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      'await import("commitlint-config-missing-array")'
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })

    expect(native.status).toBe(1)
    expect(native.stderr).toContain('ERR_MODULE_NOT_FOUND')
    expect(runNativeConfiguration(directory).status).toBe(1)
  })

  test('resolves an import-only wildcard subpath export like native Node', async () => {
    const directory = await createProject()
    const configurationDirectory = join(directory, 'node_modules', 'commitlint-config-wild')
    const rules = { 'type-enum': [2, 'always', ['wild']] }

    await mkdir(join(configurationDirectory, 'configs'), { recursive: true })
    await writeFile(join(configurationDirectory, 'package.json'), JSON.stringify({
      exports: { './presets/*': { import: './configs/*.mjs' } },
      name: 'commitlint-config-wild',
      type: 'module'
    }), 'utf8')
    await writeFile(
      join(configurationDirectory, 'configs', 'node.mjs'), `export default ${JSON.stringify({ rules })}\n`, 'utf8'
    )
    await writeFile(
      join(directory, 'commitlint.config.mjs'), 'export default { extends: ["wild/presets/node"] }\n', 'utf8'
    )

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      'const loaded = await import("commitlint-config-wild/presets/node"); process.stdout.write(JSON.stringify(loaded.default))'
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })

    expect(native.status).toBe(0)
    expect(native.stderr).toBe('')
    expect(JSON.parse(native.stdout)).toEqual({ rules })

    const loaded = runNativeConfiguration(directory)

    expect(loaded.status).toBe(0)
    expect(loaded.stderr).toBe('')
    expect(JSON.parse(loaded.stdout)).toEqual(rules)
  })

  test.each([
    { name: 'literal dollar match', subpath: '$&', target: { import: './configs/*.mjs' } },
    { name: 'nested array targets', subpath: 'nested', target: { import: [[null, './configs/*.mjs']] } }
  ])('resolves wildcard exports with $name like native Node', async ({ subpath, target }) => {
    const directory = await createProject()
    const configurationDirectory = join(directory, 'node_modules', 'commitlint-config-pattern-edge')
    const rules = { 'type-enum': [2, 'always', ['pattern']] }

    await mkdir(join(configurationDirectory, 'configs'), { recursive: true })
    await writeFile(join(configurationDirectory, 'package.json'), JSON.stringify({
      exports: { './presets/*': target },
      name: 'commitlint-config-pattern-edge',
      type: 'module'
    }), 'utf8')
    await writeFile(join(configurationDirectory, 'configs', `${subpath}.mjs`), `export default ${JSON.stringify({ rules })}\n`, 'utf8')
    await writeFile(join(directory, 'commitlint.config.mjs'), `export default { extends: [${JSON.stringify(`pattern-edge/presets/${subpath}`)}] }\n`, 'utf8')

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      `const loaded = await import(${JSON.stringify(`commitlint-config-pattern-edge/presets/${subpath}`)}); process.stdout.write(JSON.stringify(loaded.default.rules))`
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })
    const loaded = runNativeConfiguration(directory)

    expect(native.status).toBe(0)
    expect(native.stderr).toBe('')
    expect(loaded.status).toBe(0)
    expect(loaded.stderr).toBe('')
    expect(JSON.parse(loaded.stdout)).toEqual(JSON.parse(native.stdout))
  })

  test.each([
    { excluded: false, subpath: '', filename: '.mjs', code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
    { excluded: false, subpath: 'a%2fb', filename: 'a%2fb.mjs', code: 'ERR_INVALID_MODULE_SPECIFIER' },
    { excluded: false, subpath: 'a%5cb', filename: 'a%5cb.mjs', code: 'ERR_INVALID_MODULE_SPECIFIER' },
    { excluded: true, subpath: 'private', filename: 'private.mjs', code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }
  ])('rejects wildcard edge $subpath like native Node', async ({ excluded, subpath, filename, code }) => {
    const directory = await createProject()
    const configurationDirectory = join(directory, 'node_modules', 'commitlint-config-pattern-edge')

    await mkdir(join(configurationDirectory, 'configs'), { recursive: true })
    await writeFile(join(configurationDirectory, 'package.json'), JSON.stringify({
      exports: {
        './presets/*': { import: './configs/*.mjs' },
        ...(excluded ? { './presets/private': null } : {})
      },
      name: 'commitlint-config-pattern-edge',
      type: 'module'
    }), 'utf8')
    await writeFile(join(configurationDirectory, 'configs', filename), 'export default { rules: {} }\n', 'utf8')
    await writeFile(join(directory, 'commitlint.config.mjs'), `export default { extends: [${JSON.stringify(`pattern-edge/presets/${subpath}`)}] }\n`, 'utf8')

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      `await import(${JSON.stringify(`commitlint-config-pattern-edge/presets/${subpath}`)})`
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })

    expect(native.status).toBe(1)
    expect(native.stderr).toContain(code)
    expect(runNativeConfiguration(directory).status).toBe(1)
  })

  test.each(['$&', '$$', '$\'', '$`'])(
    'substitutes wildcard match %s literally', match => {
      expect(configurationInternals.getPatternExport({
        './presets/*': './configs/*.mjs'
      }, `./presets/${match}`)).toBe(`./configs/${match}.mjs`)
    }
  )

  test('prefers the most specific overlapping wildcard pattern like native Node', async () => {
    const directory = await createProject()
    const configurationDirectory = join(directory, 'node_modules', 'commitlint-config-overlap')
    const rules = { 'type-enum': [2, 'always', ['specific']] }

    await mkdir(join(configurationDirectory, 'configs'), { recursive: true })
    await writeFile(join(configurationDirectory, 'package.json'), JSON.stringify({
      exports: {
        './presets/*': { import: './configs/*.mjs' },
        './presets/node/*': { import: './configs/special-*.mjs' }
      },
      name: 'commitlint-config-overlap',
      type: 'module'
    }), 'utf8')
    await writeFile(
      join(configurationDirectory, 'configs', 'special-foo.mjs'), `export default ${JSON.stringify({ rules })}\n`, 'utf8'
    )
    await writeFile(
      join(directory, 'commitlint.config.mjs'), 'export default { extends: ["overlap/presets/node/foo"] }\n', 'utf8'
    )

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      'const loaded = await import("commitlint-config-overlap/presets/node/foo"); process.stdout.write(JSON.stringify(loaded.default))'
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })

    expect(native.status).toBe(0)
    expect(JSON.parse(native.stdout)).toEqual({ rules })

    const loaded = runNativeConfiguration(directory)

    expect(loaded.status).toBe(0)
    expect(JSON.parse(loaded.stdout)).toEqual(rules)
  })

  test.each([
    'wild/presets/../../etc/passwd',
    'wild/presets/%2e%2e/escape',
    'wild/other/missing'
  ])('rejects a wildcard subpath that native Node cannot match: %s', async specifier => {
    const directory = await createProject()
    const configurationDirectory = join(directory, 'node_modules', 'commitlint-config-wild')

    await mkdir(join(configurationDirectory, 'configs'), { recursive: true })
    await writeFile(join(configurationDirectory, 'package.json'), JSON.stringify({
      exports: { './presets/*': { import: './configs/*.mjs' } },
      name: 'commitlint-config-wild',
      type: 'module'
    }), 'utf8')
    await writeFile(
      join(configurationDirectory, 'configs', 'node.mjs'), 'export default { rules: {} }\n', 'utf8'
    )
    await writeFile(
      join(directory, 'commitlint.config.mjs'), `export default { extends: [${JSON.stringify(specifier)}] }\n`, 'utf8'
    )

    const importSpecifier = specifier.replace('wild/', 'commitlint-config-wild/')

    const native = spawnSync(process.execPath, ['--input-type=module',
      '--eval',
      `await import(${JSON.stringify(importSpecifier)})`
    ], { cwd: directory, encoding: 'utf8', timeout: 5000 })

    expect(native.status).toBe(1)
    expect(native.stderr).toMatch(/ERR_INVALID_MODULE_SPECIFIER|ERR_PACKAGE_PATH_NOT_EXPORTED/u)
    expect(runNativeConfiguration(directory).status).toBe(1)
  })

  test('matches and substitutes wildcard export patterns without allowing traversal', () => {
    expect(configurationInternals.getPatternExport({
      './presets/*': { import: './configs/*.mjs' },
      './presets/node/*': { import: './configs/special-*.mjs' }
    }, './presets/node/foo')).toEqual({ import: './configs/special-foo.mjs' })

    expect(configurationInternals.getPatternExport({
      './presets/*': { import: './configs/*.mjs' }
    }, './presets/foo')).toEqual({ import: './configs/foo.mjs' })

    expect(configurationInternals.getPatternExport({
      './presets/*': './configs/*.mjs'
    }, './other/foo')).toBeUndefined()

    expect(configurationInternals.getPatternExport({
      './presets/*': './configs/*.mjs'
    }, './presets/../../etc/passwd')).toBeUndefined()

    expect(configurationInternals.getPatternExport({
      './presets/*': './configs/*.mjs'
    }, './presets/%2e%2e/escape')).toBeUndefined()

    expect(configurationInternals.getPatternExport({
      './presets/*.mjs': './configs/*.mjs'
    }, './presets/node.mjs')).toBe('./configs/node.mjs')

    expect(configurationInternals.getPackageExport({
      exports: {
        '.': './index.js',
        './presets/*': './configs/*.mjs'
      }
    }, '')).toBe('./index.js')

    expect(configurationInternals.getPackageExport({
      exports: {
        './presets/node': './configs/exact.mjs',
        './presets/*': './configs/*.mjs'
      }
    }, 'presets/node')).toBe('./configs/exact.mjs')
  })

  test.each([
    { output: '', status: 1, subpath: 'missing' },
    { output: JSON.stringify({ 'type-enum': [2, 'always', ['fix']] }), status: 0, subpath: 'feature.mjs' }
  ])('resolves legacy package subpath without using the root entry: $subpath', async ({ output, status, subpath }) => {
    const directory = await createProject()
    const configurationDirectory = join(directory, 'node_modules', 'commitlint-config-legacy')
    const rules = { 'type-enum': [2, 'always', ['fix']] }

    await mkdir(configurationDirectory, { recursive: true })
    await writeFile(join(configurationDirectory, 'package.json'), JSON.stringify({
      main: './index.mjs',
      name: 'commitlint-config-legacy',
      type: 'module'
    }), 'utf8')
    await writeFile(join(configurationDirectory, 'index.mjs'), 'export default { rules: {} }\n', 'utf8')
    await writeFile(join(configurationDirectory, 'feature.mjs'), `export default ${JSON.stringify({ rules })}\n`, 'utf8')
    await writeFile(join(directory, 'commitlint.config.mjs'), `export default { extends: ["legacy/${subpath}"] }\n`, 'utf8')

    const loaded = runNativeConfiguration(directory)

    expect(loaded.status).toBe(status)
    expect(loaded.stdout).toBe(output)
  })

  test('loads inline plugins and executes asynchronous rules', async () => {
    const directory = await createProject()

    await writeFile(
      join(directory, 'commitlint.config.mjs'), `export default {
  plugins: [{
    rules: {
      'ticket-required': parsed => [
        parsed.header.includes('[ABC-'),
        'ticket identifier is required'
      ]
    }
  }],
  rules: {
    'ticket-required': async () => [2, 'always']
  }
}
`, 'utf8'
    )

    const configuration = await loadCommitlintConfiguration(directory)

    expect(configuration.plugins.local?.rules['ticket-required'])
      .toBeTypeOf('function')
    expect(configuration.rules['ticket-required'])
      .toEqual([2, 'always'])

    const validator = createCommitlintValidator(directory)

    await expect(validator.validate('feat: add [ABC-123] integration'))
      .resolves.toEqual(expect.objectContaining({ valid: true }))
    await expect(validator.validate('feat: omit integration ticket'))
      .resolves.toEqual(expect.objectContaining({
        errors: [
          'ticket-required: ticket identifier is required'
        ],
        valid: false
      }))
  })

  test('resolves named plugins relative to the repository', async () => {
    const directory = await createProject()
    const pluginDirectory =
      join(directory, 'node_modules', 'commitlint-plugin-example')

    await mkdir(pluginDirectory, { recursive: true })
    await writeFile(
      join(pluginDirectory, 'package.json'), '{"name":"commitlint-plugin-example","type":"module","exports":"./index.js"}\n', 'utf8'
    )
    await writeFile(
      join(pluginDirectory, 'index.js'), `export default {
  rules: {
    required: () => [true]
  }
}
`, 'utf8'
    )
    await writeFile(
      join(directory, 'commitlint.config.mjs'), `export default {
  plugins: ['example'],
  rules: {
    required: [2, 'always']
  }
}
`, 'utf8'
    )

    const configuration = await loadCommitlintConfiguration(directory)

    expect(configuration.plugins.example?.rules.required)
      .toBeTypeOf('function')
  })

  test('resolves plugins relative to extended configurations', async () => {
    const directory = await createProject()
    const configurationDirectory =
      join(directory, 'node_modules', 'commitlint-config-with-plugin')
    const pluginDirectory =
      join(configurationDirectory, 'node_modules', 'commitlint-plugin-nested')

    await mkdir(pluginDirectory, { recursive: true })
    await writeFile(
      join(configurationDirectory, 'package.json'), '{"name":"commitlint-config-with-plugin","type":"module","exports":"./index.js"}\n', 'utf8'
    )
    await writeFile(
      join(configurationDirectory, 'index.js'), `export default {
  plugins: ['nested'],
  rules: {
    required: [2, 'always']
  }
}
`, 'utf8'
    )
    await writeFile(
      join(pluginDirectory, 'package.json'), '{"name":"commitlint-plugin-nested","type":"module","exports":"./index.js"}\n', 'utf8'
    )
    await writeFile(
      join(pluginDirectory, 'index.js'), `export default {
  rules: {
    required: () => [true]
  }
}
`, 'utf8'
    )
    await writeFile(
      join(directory, 'commitlint.config.mjs'), 'export default { extends: [\'with-plugin\'] }\n', 'utf8'
    )

    const configuration = await loadCommitlintConfiguration(directory)

    expect(configuration.plugins.nested?.rules.required)
      .toBeTypeOf('function')
  })
})

describe('configuration internals', () => {
  test('normalizes extended configuration and plugin names', () => {
    expect(configurationInternals.normalizeExtendedConfigurationName('custom'))
      .toBe('commitlint-config-custom')
    expect(configurationInternals.normalizeExtendedConfigurationName(
      'commitlint-config-custom'
    )).toBe('commitlint-config-custom')
    expect(configurationInternals.normalizeExtendedConfigurationName(
      '@scope/config'
    )).toBe('@scope/config')
    expect(configurationInternals.normalizeExtendedConfigurationName(
      '@scope'
    )).toBe('@scope/commitlint-config')
    expect(configurationInternals.normalizeExtendedConfigurationName(
      './config.mjs'
    )).toBe('./config.mjs')

    expect(configurationInternals.normalizePluginName('@scope'))
      .toBe('@scope/commitlint-plugin')
    expect(configurationInternals.normalizePluginName('@scope/example'))
      .toBe('@scope/commitlint-plugin-example')
    expect(configurationInternals.normalizePluginName(
      '@scope/commitlint-plugin-example'
    )).toBe('@scope/commitlint-plugin-example')
    expect(configurationInternals.getPluginKey('@scope/example'))
      .toBe('@scope/example')
    expect(configurationInternals.getPluginKey('example')).toBe('example')
  })

  test('resolves conditional exports and package metadata fallbacks', async () => {
    expect(configurationInternals.unwrapDefault('plain')).toBe('plain')
    expect(configurationInternals.getConditionalExport('./index.js'))
      .toBe('./index.js')
    expect(configurationInternals.getConditionalExport({
      import: './import.js'
    })).toBe('./import.js')
    expect(configurationInternals.getConditionalExport({
      module: './module.js'
    })).toBeUndefined()
    expect(configurationInternals.getConditionalExport({
      default: './default.js'
    })).toBe('./default.js')
    expect(configurationInternals.getConditionalExport(undefined))
      .toBeUndefined()
    expect(configurationInternals.getPackageParts('@scope/example/subpath'))
      .toEqual({
        name: '@scope/example',
        subpath: 'subpath'
      })
    expect(configurationInternals.getPackageParts('example'))
      .toEqual({
        name: 'example',
        subpath: ''
      })
    expect(configurationInternals.getPackageExport({
      exports: {
        '.': {
          import: './index.js'
        }
      }
    }, '')).toEqual({
      import: './index.js'
    })
    expect(configurationInternals.getPackageExport({
      exports: {
        './feature': './feature.js'
      }
    }, 'feature')).toBe('./feature.js')
    expect(configurationInternals.getPackageExport({}, 'feature'))
      .toBeUndefined()
    expect(configurationInternals.getPackageFallback({
      module: './module.js'
    })).toBe('./module.js')
    expect(configurationInternals.getPackageFallback({
      main: './main.js'
    })).toBe('./main.js')
    expect(configurationInternals.getPackageFallback({})).toBe('index.js')

    const directory = await createProject()
    const packageDirectory = join(directory, 'node_modules', 'esm-only')

    await mkdir(packageDirectory, { recursive: true })
    await writeFile(
      join(packageDirectory, 'package.json'), '{"name":"esm-only","exports":{".":{"import":"./index.js"}},"type":"module"}\n', 'utf8'
    )
    await writeFile(
      join(packageDirectory, 'index.js'), 'export default {}\n', 'utf8'
    )

    expect(configurationInternals.resolveEsmPackage('esm-only', directory))
      .toBe(join(packageDirectory, 'index.js'))
    expect(configurationInternals.resolveEsmPackage('./local.js', directory))
      .toBeUndefined()
    expect(configurationInternals.resolveEsmPackage('missing', directory))
      .toBeUndefined()

    const invalidManifestPath = join(directory, 'invalid-package.json')

    await writeFile(invalidManifestPath, '[]\n', 'utf8')
    expect(configurationInternals.resolvePackageEntry(
      invalidManifestPath, directory, ''
    )).toBeUndefined()
  })

  test('does not fall back to the legacy entry for an unresolved exports subpath', async () => {
    const directory = await createProject()
    const packageDirectory = join(directory, 'node_modules', 'scoped-only')

    await mkdir(packageDirectory, { recursive: true })
    await writeFile(
      join(packageDirectory, 'package.json'), '{"name":"scoped-only","type":"module","exports":{".":{"import":"./index.js"}}}\n', 'utf8'
    )
    await writeFile(
      join(packageDirectory, 'index.js'), 'export default {}\n', 'utf8'
    )

    const manifestPath = join(packageDirectory, 'package.json')

    expect(configurationInternals.resolvePackageEntry(
      manifestPath, packageDirectory, 'missing'
    )).toBeUndefined()
    expect(configurationInternals.resolveEsmPackage(
      'scoped-only/missing', directory
    )).toBeUndefined()
    expect(configurationInternals.resolvePackageEntry(
      manifestPath, packageDirectory, ''
    )).toBe(join(packageDirectory, 'index.js'))
  })

  test('still falls back to the legacy entry point without an exports map', async () => {
    const directory = await createProject()
    const packageDirectory = join(directory, 'node_modules', 'legacy-pkg')

    await mkdir(packageDirectory, { recursive: true })
    await writeFile(
      join(packageDirectory, 'package.json'), '{"name":"legacy-pkg","main":"./lib/index.js"}\n', 'utf8'
    )
    await mkdir(join(packageDirectory, 'lib'), { recursive: true })
    await writeFile(
      join(packageDirectory, 'lib', 'index.js'), 'module.exports = {}\n', 'utf8'
    )

    expect(configurationInternals.resolvePackageEntry(
      join(packageDirectory, 'package.json'), packageDirectory, ''
    )).toBe(join(packageDirectory, 'lib', 'index.js'))
  })

  test('resolves an existing exports subpath instead of the root entry', async () => {
    const directory = await createProject()
    const packageDirectory = join(directory, 'node_modules', 'multi-export')

    await mkdir(packageDirectory, { recursive: true })
    await writeFile(
      join(packageDirectory, 'package.json'), '{"name":"multi-export","type":"module","exports":{".":"./index.js","./feature":"./feature.js"},"main":"./index.js"}\n', 'utf8'
    )
    await writeFile(join(packageDirectory, 'index.js'), 'export default {}\n', 'utf8')
    await writeFile(join(packageDirectory, 'feature.js'), 'export default {}\n', 'utf8')

    expect(configurationInternals.resolvePackageEntry(
      join(packageDirectory, 'package.json'), packageDirectory, 'feature'
    )).toBe(join(packageDirectory, 'feature.js'))
  })

  test('selects the first resolvable array export target', () => {
    expect(configurationInternals.getConditionalExport([
      './a.mjs', './b.mjs'
    ])).toBe('./a.mjs')
    expect(configurationInternals.getConditionalExport([null, [], 42]))
      .toBeNull()
  })

  test('merges configuration records with plugin concatenation', () => {
    expect(configurationInternals.mergeRecords(
      {
        plugins: ['first'],
        rules: {
          first: [1]
        }
      }, {
        plugins: ['second'],
        rules: {
          second: [2]
        },
        value: true
      }
    )).toEqual({
      plugins: ['first', 'second'],
      rules: {
        first: [1],
        second: [2]
      },
      value: true
    })
    expect(configurationInternals.normalizeExtends('example'))
      .toEqual(['example'])
    expect(configurationInternals.normalizeExtends(undefined)).toEqual([])
    expect(configurationInternals.applyParserPreset(
      { rules: {} }, undefined
    )).toEqual({ rules: {} })
  })

  test('executes callback and promise parser factories', async () => {
    await expect(configurationInternals.executeParserFactory(callback => {
      callback(undefined, {
        parserOpts: {
          headerPattern: /^(.*)$/u
        }
      })
    })).resolves.toEqual({
      headerPattern: /^(.*)$/u
    })

    await expect(configurationInternals.executeParserFactory(
      () => Promise.resolve({
        parser: {
          noteKeywords: ['BREAKING CHANGE']
        }
      })
    )).resolves.toEqual({
      noteKeywords: ['BREAKING CHANGE']
    })

    await expect(configurationInternals.executeParserFactory(callback => {
      callback('parser failed')
    })).rejects.toThrow('parser failed')

    await expect(configurationInternals.executeParserFactory(() => {
      throw new Error('factory failed')
    })).rejects.toThrow('factory failed')
  })

  test('unwraps nested parser options and rejects non-presets', async () => {
    await expect(configurationInternals.loadParserOptions(undefined))
      .resolves.toBeUndefined()
    await expect(configurationInternals.loadParserOptions({
      parserOpts: {
        issuePrefixes: ['#'],
        parserOpts: {
          headerPattern: /^(.*)$/u
        }
      }
    })).resolves.toEqual(expect.objectContaining({
      parserOpts: {
        headerPattern: /^(.*)$/u,
        issuePrefixes: ['#']
      }
    }))
  })
})
