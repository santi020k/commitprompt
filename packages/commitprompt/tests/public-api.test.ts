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
  Prompt,
  ResolveVSCodeSettingsPathOptions,
  ResolveZedSettingsPathOptions,
  RunAutomationOptions,
  RunCommitFlowOptions,
  SetupVSCodeOptions,
  SetupVSCodeResult,
  SetupZedOptions,
  SetupZedResult
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
  Prompt,
  ResolveVSCodeSettingsPathOptions,
  ResolveZedSettingsPathOptions,
  RunAutomationOptions,
  RunCommitFlowOptions,
  SetupVSCodeOptions,
  SetupVSCodeResult,
  SetupZedOptions,
  SetupZedResult
]

describe('public API', () => {
  test('keeps the v1 runtime exports stable', () => {
    expectTypeOf<PublicApiTypes>().toBeArray()

    expect(Object.keys(publicApi).sort()).toEqual([
      'COMMIT_MESSAGE_INSTRUCTIONS',
      'DEFAULT_COMMIT_TYPES',
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
      'setupVSCode',
      'setupZed'
    ])
  })
})
