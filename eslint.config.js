import { defineConfig } from '@santi020k/eslint-config-basic'

export default defineConfig({
  testingFiles: {
    playwright: ['apps/docs/tests/**/*.{ts,tsx}']
  }
}, {
  files: ['packages/commitprompt/bin/commitprompt.ts'],
  rules: {
    'n/hashbang': ['error', {
      additionalExecutables: ['bin/commitprompt.ts']
    }]
  }
})
