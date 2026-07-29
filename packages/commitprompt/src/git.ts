import { spawnSync } from 'node:child_process'

import type { CreateGitClientOptions, GitClient } from './types.js'

const getFailureMessage = (
  command: string,
  stderr: Buffer | string | null | undefined
): string => {
  const detail = stderr?.toString().trim()

  return detail ? `${command} failed: ${detail}` : `${command} failed.`
}

export const createGitClient = (
  cwd: string,
  { silent = false }: CreateGitClientOptions = {}
): GitClient => ({
  commit: message => {
    const result = spawnSync('git', ['commit', '--file=-'], {
      cwd,
      encoding: 'utf8',
      input: message,
      stdio: silent
        ? ['pipe', 'pipe', 'pipe']
        : ['pipe', 'inherit', 'inherit']
    })

    if (result.error) throw result.error

    if (result.status !== 0) {
      throw new Error(getFailureMessage('git commit', result.stderr))
    }
  },
  hasStagedChanges: () => {
    const result = spawnSync('git', ['diff', '--cached', '--quiet'], {
      cwd,
      encoding: 'utf8'
    })

    if (result.error) throw result.error

    if (result.status === 0) return false

    if (result.status === 1) return true

    throw new Error(getFailureMessage('git diff --cached', result.stderr))
  }
})
