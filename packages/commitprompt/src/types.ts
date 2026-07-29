export interface CommitAnswers {
  body: string
  breaking: string
  issues: string
  scope: string
  subject: string
  type: string
}

export interface CommitType {
  description: string
  value: string
}

export interface GitClient {
  commit: (message: string) => void
  hasStagedChanges: () => boolean
}

export interface MessageValidation {
  errors: string[]
  valid: boolean
  warnings: string[]
}

export interface MessageValidator {
  validate: (message: string) => Promise<MessageValidation>
}

export interface CommitlintClient extends MessageValidator {
  getTypes: () => Promise<readonly CommitType[]>
}

export interface Prompt {
  close: () => void
  question: (query: string) => Promise<string>
}

export interface RunCommitFlowOptions {
  error: (message: string) => void
  git: GitClient
  log: (message: string) => void
  prompt: Prompt
  types?: readonly CommitType[]
  validator: MessageValidator
}

export type AutomationCommand =
  | 'commit'
  | 'format'
  | 'instructions'
  | 'types'
  | 'validate'

export interface RunAutomationOptions {
  command: AutomationCommand
  confirm?: boolean
  cwd: string
  error: (message: string) => void
  input?: string
  json?: boolean
  log: (message: string) => void
}
