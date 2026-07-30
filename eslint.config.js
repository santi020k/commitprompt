import { defineConfig } from '@santi020k/eslint-config-basic'

export default defineConfig({}, {
  files: ['packages/commitprompt/bin/commitprompt.ts'],
  rules: {
    'n/hashbang': ['error', {
      additionalExecutables: ['bin/commitprompt.ts']
    }]
  }
})
