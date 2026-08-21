import { join } from 'node:path'

import { getCommitMessageInstructions } from './editor.js'
import { createCommitlintValidator } from './validator.js'
import { setupVSCode } from './vscode.js'
import { setupZed } from './zed.js'

const REPOSITORY_INSTRUCTION_PREFIX = 'Commitprompt repository rules:'
const ZED_START_MARKER = '[commitprompt:start]'
const ZED_END_MARKER = '[commitprompt:end]'

export type WorkspaceEditor = 'vscode' | 'zed'

export interface WorkspaceEditorAction {
  changed: boolean
  editor: WorkspaceEditor
  path: string
}

export interface SetupWorkspaceEditorsOptions {
  check?: boolean
  cwd: string
  dryRun?: boolean
  editors?: readonly WorkspaceEditor[]
}

export interface SetupWorkspaceEditorsResult {
  actions: WorkspaceEditorAction[]
  changed: boolean
  drift: boolean
  instructions: string
}

const isWorkspaceEditor = (value: string): value is WorkspaceEditor => value === 'vscode' || value === 'zed'

const getSelectedEditors = (
  editors: readonly string[]
): ReadonlySet<WorkspaceEditor> => {
  if (editors.length === 0) {
    throw new Error('Workspace editor setup requires at least one editor.')
  }

  const unknownEditor = editors.find(editor => !isWorkspaceEditor(editor))

  if (unknownEditor !== undefined) {
    throw new Error(`Unsupported workspace editor: ${unknownEditor}`)
  }

  return new Set(editors.filter(isWorkspaceEditor))
}

export const setupWorkspaceEditors = async ({
  check = false,
  cwd,
  dryRun = false,
  editors = ['vscode', 'zed']
}: SetupWorkspaceEditorsOptions): Promise<SetupWorkspaceEditorsResult> => {
  const selectedEditors = getSelectedEditors(editors)
  const validator = createCommitlintValidator(cwd)

  const [types, scopes] = await Promise.all([
    validator.getTypes(),
    validator.getScopes()
  ])

  const generated = getCommitMessageInstructions(types, scopes)
  const instructions = `${REPOSITORY_INSTRUCTION_PREFIX} ${generated}`
  const analyzeOnly = check || dryRun
  const actions: WorkspaceEditorAction[] = []

  if (selectedEditors.has('vscode')) {
    const result = await setupVSCode({
      check: analyzeOnly,
      instructions,
      settingsPath: join(cwd, '.vscode', 'settings.json')
    })

    actions.push({
      changed: result.changed,
      editor: 'vscode',
      path: result.settingsPath
    })
  }

  if (selectedEditors.has('zed')) {
    const result = await setupZed({
      check: analyzeOnly,
      instructions:
        `${ZED_START_MARKER}\n${instructions}\n${ZED_END_MARKER}`,
      settingsPath: join(cwd, '.zed', 'settings.json')
    })

    actions.push({
      changed: result.changed,
      editor: 'zed',
      path: result.settingsPath
    })
  }

  const drift = actions.some(action => action.changed)

  return {
    actions,
    changed: !analyzeOnly && drift,
    drift,
    instructions
  }
}
