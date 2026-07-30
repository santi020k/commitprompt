import { spawnSync } from 'node:child_process'

import type { PackageManager } from './project.js'

export interface InstallProjectDependenciesOptions {
  cwd: string
  packageManager: PackageManager
  silent?: boolean
}

export const installProjectDependencies = ({
  cwd,
  packageManager,
  silent = false
}: InstallProjectDependenciesOptions): void => {
  const result = spawnSync(packageManager, ['install'], {
    cwd,
    encoding: 'utf8',
    stdio: silent ? 'pipe' : 'inherit'
  })

  if (result.error !== undefined) throw result.error

  if (result.status === 0) return

  const details = [result.stdout, result.stderr]
    .filter(output => output?.trim())
    .join('\n')

  throw new Error(
    `${packageManager} install failed with exit code ${String(result.status)}.` +
    (details.length === 0 ? '' : `\n${details.trim()}`)
  )
}
