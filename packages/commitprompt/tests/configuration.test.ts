import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
  configurationInternals,
  loadCommitlintConfiguration
} from '../src/configuration.js'
import { createCommitlintValidator } from '../src/validator.js'

const temporaryDirectories: string[] = []

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
    })).toBe('./module.js')
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
