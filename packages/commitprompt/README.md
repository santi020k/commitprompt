# Commitprompt

A focused, package-manager-neutral prompt for Conventional Commits.

## Install

```sh
pnpm add --save-dev @santi020k/commitprompt
npm install --save-dev @santi020k/commitprompt
yarn add --dev @santi020k/commitprompt
```

Add the command to `package.json`:

```json
{
  "scripts": {
    "commit": "commitprompt"
  }
}
```

Commitprompt loads the consuming repository's Commitlint configuration, checks
that changes are staged, guides the author through a Conventional Commit,
validates the result, previews it, and creates the commit after confirmation.

Commitprompt includes Conventional Commits validation, so a separate Commitlint
configuration is optional. When the repository defines `type-enum` or
`scope-enum`, Commitprompt uses those values in the corresponding prompts.

## Usage

Stage the intended changes, then run the package script:

```sh
git add src/
pnpm commit
```

The body accepts multiple lines. Submit an empty line to finish it. Invalid
messages can be revised without restarting Commitprompt.

## Editor AI

Configure Zed's or VS Code's native Git commit-message generator to use
Commitprompt's Conventional Commit format in every project:

```sh
commitprompt setup zed
commitprompt setup vscode
```

Each command safely updates the editor's global settings and preserves existing
settings, comments, model selection, and custom commit-message instructions.
Running it more than once does not duplicate the Commitprompt instructions.
VS Code uses GitHub Copilot's commit-message generator; both editors continue
to use the model configured by the user. These setup commands provide generation
instructions and do not run Commitlint validation by themselves. GitHub Copilot
must be enabled for VS Code's Source Control generation button to be available.

## Requirements

- Node.js 22.18 or newer
- Git
- At least one staged change

## Repository rules

Add a Commitlint configuration only when the repository needs to extend or
override the included conventional defaults:

```js
export default {
  rules: {
    // 0 disables a rule, 1 warns, and 2 rejects the message.
    'header-max-length': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'type-enum': [2, 'always', ['feat', 'fix', 'release']],
    'scope-enum': [2, 'always', ['cli', 'docs']]
  }
}
```

Commitprompt passes repository parser presets, plugins, ignores, default
ignores, and help URLs to Commitlint. Configured `type-enum` and `scope-enum`
rules also change the choices shown by the prompt. Without `scope-enum`, the
optional scope remains free-form. A repository configuration takes precedence
over the built-in fallback; rules that it does not declare or receive through
`extends` are not enforced.

## Git hooks

Commitprompt validates messages created through the `commitprompt` flow. It
does not install Git hooks, so commits created directly by Git or an editor do
not pass through Commitprompt. Use Commitlint in a `commit-msg` hook when every
commit must be enforced. A `pre-commit` hook runs before the message exists and
is better suited to staged-file checks.

## Automation and AI tools

AI tools can use machine-readable commands without driving the terminal prompt.
Inspect the repository and staged diff first, then discover its allowed types:

```sh
commitprompt instructions --json
commitprompt scopes --json
commitprompt types --json
```

Pass structured answers to the formatter:

```sh
commitprompt format --json <<'JSON'
{
  "type": "feat",
  "scope": "cli",
  "subject": "accept structured input",
  "body": "",
  "breaking": "",
  "issues": ""
}
JSON
```

Validate a complete message with the consuming repository's rules:

```sh
printf '%s\n' 'feat(cli): accept structured input' \
  | commitprompt validate --json
```

When a user has explicitly authorized the commit, an agent can format, validate,
check for staged changes, and commit in one operation:

```sh
commitprompt commit --yes --json < commit.json
```

The explicit `--yes` flag is required for non-interactive commits. Git hooks
continue to run. Use `--input <path>` to read a file instead of stdin and
`--cwd <path>` to load another repository's Commitlint configuration.

The package includes a complete [AI agent guide](AI.md) with its input, output,
exit-code, and safety contracts.

The exported formatter and validator remain available for custom integrations:

```js
import {
  createCommitlintValidator,
  formatCommitMessage
} from '@santi020k/commitprompt'

const validator = createCommitlintValidator(process.cwd())
const message = formatCommitMessage({
  type: 'feat',
  scope: 'cli',
  subject: 'accept structured input',
  body: '',
  breaking: '',
  issues: ''
})
const result = await validator.validate(message)

if (!result.valid) {
  throw new Error(result.errors.join('\n'))
}

process.stdout.write(message)
```

This keeps generation and enforcement separate: the AI proposes structured
content, while Commitprompt formats and validates the exact result with the
repository's rules.

## Programmatic API

```ts
import {
  createCommitlintValidator,
  createGitClient,
  formatCommitMessage,
  runAutomation,
  runCommitFlow
} from '@santi020k/commitprompt'
```

The message formatter, default commit types, Git adapter, cached Commitlint
client, prompt helpers, non-interactive automation flow, and full interactive
commit flow are exported for integrations and testing. The Commitlint client
exposes `validate(message)`, `getTypes()`, and `getScopes()`.

## License

MIT
