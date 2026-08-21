import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const packageDirectory = resolve(import.meta.dirname, '..')

for (const output of process.argv.slice(2)) {
  rmSync(join(packageDirectory, output), {
    force: true,
    recursive: true
  })
}
