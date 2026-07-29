import {
  defineConfig,
  Extension,
  Format,
  Preset,
  Tool
} from '@santi020k/eslint-config-basic'

export default await defineConfig(
  {
    detectRootDir: import.meta.dirname,
    extensions: [Extension.Unicorn],
    formats: [Format.Markdown],
    frameworks: { astro: true },
    preset: Preset.Browser,
    tools: [Tool.Cspell],
    tsconfigRootDir: import.meta.dirname,
    typescript: true
  }, {
    files: ['**/*.astro'],
    rules: {
      '@stylistic/indent': 'off',
      '@stylistic/jsx-closing-tag-location': 'off',
      '@stylistic/max-len': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off'
    }
  }, {
    files: ['src/env.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off'
    }
  }, {
    files: ['scripts/**/*.{js,mjs}'],
    rules: {
      'no-console': 'off'
    }
  }
)
