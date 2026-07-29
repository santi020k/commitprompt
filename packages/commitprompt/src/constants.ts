import type { CommitType } from './types.js'

export const DEFAULT_COMMIT_TYPES: readonly CommitType[] = [
  { description: 'A new feature', value: 'feat' },
  { description: 'A bug fix', value: 'fix' },
  { description: 'Documentation only', value: 'docs' },
  { description: 'Formatting without behavior changes', value: 'style' },
  { description: 'A code change that is neither a fix nor a feature', value: 'refactor' },
  { description: 'A performance improvement', value: 'perf' },
  { description: 'Tests', value: 'test' },
  { description: 'Build system or dependency changes', value: 'build' },
  { description: 'CI configuration', value: 'ci' },
  { description: 'Other maintenance', value: 'chore' },
  { description: 'Revert a previous change', value: 'revert' }
]
