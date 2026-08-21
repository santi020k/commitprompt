import { describe, expect, expectTypeOf, test } from 'vitest'

import type {
  AutomationCommand,
  CommitAnswers,
  CommitlintClient,
  CommitType,
  CreateGitClientOptions,
  GitClient,
  MessageValidation,
  MessageValidator,
  PackageManager,
  ProjectSetupAction,
  ProjectSetupActionId,
  ProjectSetupOptions,
  ProjectSetupResult,
  Prompt,
  ResolveVSCodeSettingsPathOptions,
  ResolveZedSettingsPathOptions,
  RunAutomationOptions,
  RunCommitFlowOptions,
  SetupVSCodeOptions,
  SetupVSCodeResult,
  SetupWorkspaceEditorsOptions,
  SetupWorkspaceEditorsResult,
  SetupZedOptions,
  SetupZedResult,
  WorkspaceEditor,
  WorkspaceEditorAction
} from '../src/index.js'
import * as publicApi from '../src/index.js'

type PublicApiTypes = [
  AutomationCommand,
  CommitAnswers,
  CommitlintClient,
  CommitType,
  CreateGitClientOptions,
  GitClient,
  MessageValidation,
  MessageValidator,
  PackageManager,
  Prompt,
  ProjectSetupAction,
  ProjectSetupActionId,
  ProjectSetupOptions,
  ProjectSetupResult,
  ResolveVSCodeSettingsPathOptions,
  ResolveZedSettingsPathOptions,
  RunAutomationOptions,
  RunCommitFlowOptions,
  SetupWorkspaceEditorsOptions,
  SetupWorkspaceEditorsResult,
  SetupVSCodeOptions,
  SetupVSCodeResult,
  SetupZedOptions,
  SetupZedResult,
  WorkspaceEditor,
  WorkspaceEditorAction
]

describe('public API', () => {
  test('keeps the v1 runtime exports stable', () => {
    expectTypeOf<PublicApiTypes>().toBeArray()

    expect(Object.keys(publicApi).sort()).toEqual([
      'AGENT_SKILL_TEMPLATE',
      'COMMIT_MESSAGE_INSTRUCTIONS',
      'DEFAULT_COMMIT_TYPES',
      'INSTRUCTION_END_MARKER',
      'INSTRUCTION_START_MARKER',
      'PROJECT_INSTRUCTION_BODY',
      'PROJECT_INSTRUCTION_SECTION',
      'ZED_COMMIT_MESSAGE_INSTRUCTIONS',
      'collectCommitAnswers',
      'confirmCommit',
      'confirmRetry',
      'createCommitlintValidator',
      'createGitClient',
      'formatCommitMessage',
      'resolveVSCodeSettingsPath',
      'resolveZedSettingsPath',
      'runAutomation',
      'runCli',
      'runCommitFlow',
      'setupProject',
      'setupVSCode',
      'setupWorkspaceEditors',
      'setupZed'
    ])
  })
})
