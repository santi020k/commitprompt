import {
  defineConfig,
  Extension,
  Format,
  Preset,
  Runtime,
  Testing,
  Tool
} from '@santi020k/eslint-config-basic'
import tseslint from 'typescript-eslint'

export default await defineConfig(
  {
    autoFrameworks: false,
    detection: { libraries: false },
    detectRootDir: import.meta.dirname,
    extensions: [Extension.Unicorn],
    formats: [Format.Jsonc, Format.Markdown],
    ignores: ['apps/docs/**'],
    preset: Preset.Monorepo,
    projects: {
      'packages/commitprompt': {
        preset: Preset.Library,
        runtime: Runtime.Node
      }
    },
    testing: [Testing.Vitest],
    tools: [Tool.Pnpm, Tool.Cspell, Tool.GithubActions],
    tsconfigRootDir: import.meta.dirname,
    typescript: true
  },
  {
    files: ['**/*.config.js', '**/*.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false
      }
    },
    ...tseslint.configs.disableTypeChecked
  },
  {
    files: [
      'packages/commitprompt/bin/**/*.ts',
      'packages/commitprompt/src/cli.ts',
      'scripts/**/*.mjs'
    ],
    rules: {
      'no-console': 'off',
      'n/hashbang': 'off'
    }
  },
  {
    files: ['packages/commitprompt/tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './packages/commitprompt/tests/tsconfig.json',
        projectService: false,
        tsconfigRootDir: import.meta.dirname
      }
    }
  }
)
