import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'

import {
  parse,
  type ParseError,
  printParseErrorCode
} from 'jsonc-parser'

const isMissingFileError = (error: unknown): boolean => error instanceof Error &&
  'code' in error &&
  error.code === 'ENOENT'

export const isSettingsRecord = (
  value: unknown
): value is Record<string, unknown> => typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value)

export const readSettings = async (settingsPath: string): Promise<string> => {
  try {
    return await readFile(settingsPath, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) return '{}\n'

    throw error
  }
}

export const parseSettings = (
  source: string,
  editorName: string,
  { allowTrailingComma = false }: { allowTrailingComma?: boolean } = {}
): unknown => {
  const parseErrors: ParseError[] = []
  const settings: unknown = parse(source, parseErrors, { allowTrailingComma })

  if (parseErrors.length > 0) {
    const details = parseErrors
      .map(error => printParseErrorCode(error.error))
      .join(', ')

    throw new Error(`Cannot update invalid ${editorName} settings (${details}).`)
  }

  return settings
}

export const writeSettings = async (
  settingsPath: string,
  source: string
): Promise<void> => {
  const directory = dirname(settingsPath)

  const temporaryName =
    `.${basename(settingsPath)}.${process.pid}.${randomUUID()}.tmp`

  const temporaryPath = join(directory, temporaryName)

  await mkdir(directory, { recursive: true })

  let mode: number | undefined

  try {
    mode = (await stat(settingsPath)).mode
  } catch (error) {
    if (!isMissingFileError(error)) throw error
  }

  try {
    await writeFile(temporaryPath, source, {
      encoding: 'utf8',
      ...(mode === undefined ? {} : { mode })
    })

    await rename(temporaryPath, settingsPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}
