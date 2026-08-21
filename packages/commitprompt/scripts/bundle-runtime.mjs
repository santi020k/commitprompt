import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import {
  dirname,
  join,
  parse,
  resolve,
  sep
} from 'node:path'

import { build } from 'esbuild'

const packageDirectory = resolve(import.meta.dirname, '..')
const outputDirectory = join(packageDirectory, 'dist', 'src')

const noticesPath = join(
  packageDirectory, 'dist', 'THIRD_PARTY_LICENSES.txt'
)

const findPackage = inputPath => {
  let directory = dirname(resolve(packageDirectory, inputPath))
  const filesystemRoot = parse(directory).root

  while (directory !== filesystemRoot) {
    const manifestPath = join(directory, 'package.json')

    if (
      directory.includes(`${sep}node_modules${sep}`) &&
      existsSync(manifestPath)
    ) {
      const metadata = JSON.parse(readFileSync(manifestPath, 'utf8'))

      if (
        typeof metadata.name === 'string' &&
        typeof metadata.version === 'string'
      ) {
        return {
          directory,
          name: metadata.name,
          version: metadata.version
        }
      }
    }

    directory = dirname(directory)
  }

  return undefined
}

const readLicense = dependency => {
  const licenseName = readdirSync(dependency.directory).find(
    name => /^license(?:\.|$)/iu.test(name)
  )

  if (licenseName === undefined) {
    throw new Error(
      `Bundled dependency ${dependency.name} has no license file.`
    )
  }

  return readFileSync(join(dependency.directory, licenseName), 'utf8').trim()
}

const result = await build({
  bundle: true,
  entryPoints: [join(packageDirectory, 'src', 'commitlint-lint.ts')],
  format: 'esm',
  legalComments: 'none',
  metafile: true,
  outfile: join(outputDirectory, 'commitlint-lint.js'),
  platform: 'node',
  sourcemap: true,
  target: 'node22.18'
})

const dependencies = new Map()
const noticeSeparator = '='.repeat(79)

for (const inputPath of Object.keys(result.metafile.inputs)) {
  const dependency = findPackage(inputPath)

  if (dependency !== undefined) {
    dependencies.set(`${dependency.name}@${dependency.version}`, dependency)
  }
}

const notices = [
  'Bundled third-party licenses',
  '',
  'Commitprompt includes compiled code from the following packages.',
  ''
]

for (const [identifier, dependency] of [...dependencies.entries()].sort()) {
  notices.push(
    noticeSeparator, identifier, noticeSeparator, '', readLicense(dependency), ''
  )
}

writeFileSync(noticesPath, `${notices.join('\n')}\n`)
