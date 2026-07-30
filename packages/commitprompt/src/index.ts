export { runAutomation } from './automation.js'
export { runCli, runCommitFlow } from './cli.js'
export { DEFAULT_COMMIT_TYPES } from './constants.js'
export { COMMIT_MESSAGE_INSTRUCTIONS } from './editor.js'
export { createGitClient } from './git.js'
export {
  AGENT_SKILL_TEMPLATE,
  INSTRUCTION_END_MARKER,
  INSTRUCTION_START_MARKER,
  PROJECT_INSTRUCTION_BODY,
  PROJECT_INSTRUCTION_SECTION
} from './instructions.js'
export { formatCommitMessage } from './message.js'
export type {
  PackageManager,
  ProjectSetupAction,
  ProjectSetupActionId,
  ProjectSetupOptions,
  ProjectSetupResult
} from './project.js'
export { setupProject } from './project.js'
export {
  collectCommitAnswers,
  confirmCommit,
  confirmRetry
} from './prompt.js'
export type {
  AutomationCommand,
  CommitAnswers,
  CommitlintClient,
  CommitType,
  CreateGitClientOptions,
  GitClient,
  MessageValidation,
  MessageValidator,
  Prompt,
  RunAutomationOptions,
  RunCommitFlowOptions
} from './types.js'
export { createCommitlintValidator } from './validator.js'
export type {
  ResolveVSCodeSettingsPathOptions,
  SetupVSCodeOptions,
  SetupVSCodeResult
} from './vscode.js'
export {
  resolveVSCodeSettingsPath,
  setupVSCode
} from './vscode.js'
export type {
  SetupWorkspaceEditorsOptions,
  SetupWorkspaceEditorsResult,
  WorkspaceEditor,
  WorkspaceEditorAction
} from './workspace-editor.js'
export { setupWorkspaceEditors } from './workspace-editor.js'
export type {
  ResolveZedSettingsPathOptions,
  SetupZedOptions,
  SetupZedResult
} from './zed.js'
export {
  resolveZedSettingsPath,
  setupZed,
  ZED_COMMIT_MESSAGE_INSTRUCTIONS
} from './zed.js'
