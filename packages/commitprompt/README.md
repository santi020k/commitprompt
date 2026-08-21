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

To configure a repository in one pass, run:

```sh
commitprompt setup project
```

Project setup detects the repository's package manager, updates `package.json`,
installs a package-manager-neutral Husky `commit-msg` hook, and adds guarded
Commitprompt sections to `AGENTS.md` and `.github/copilot-instructions.md`. It
reports obsolete Commitizen, Czg, and prompt configuration without deleting it.
Run the detected package manager's install command afterward to update the
lockfile and activate Husky.

Use `--dry-run` to preview changes. Use `--check` as a non-writing CI drift gate;
it exits with status 1 when setup is required. Both modes support `--json` and
`--cwd <path>`. Select independent actions with `--only dependency`,
`--only commit-script`, `--only husky-hook`, `--only agents-instructions`, or
`--only copilot-instructions`. Reusable agent skill files can be selected with
`--only agent-skill` or `--only claude-skill`; pass a comma-separated list to
combine actions.

The package also ships the generated templates under `templates/`, and project
setup writes the skill to both `.agents/skills/commitprompt/SKILL.md` and
`.claude/skills/commitprompt/SKILL.md`.

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

To create tracked, repository-aware workspace instructions for both editors,
run:

```sh
commitprompt setup editors
```

This reads `type-enum` and `scope-enum`, updates only the Commitprompt guidance
in `.vscode/settings.json` and `.zed/settings.json`, and preserves custom
instructions. Use `--editor vscode` or `--editor zed` to target one editor.
`--dry-run`, `--check`, `--json`, and `--cwd <path>` provide the same preview
and CI drift behavior as project setup.

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
optional scope remains free-form. Repository rules and `extends` entries take
precedence over the built-in fallback, and undeclared rules are not enforced.
JavaScript, JSON, YAML, and erasable TypeScript configuration files are
supported through Node.js without adding TypeScript to consumer dependencies.
When a resolved configuration has no `extends`, parser preset, or declared
rules, Commitprompt retains its other settings and supplies the included
Conventional Commits rules so validation never uses an empty rule set by
accident.

## Migrating an existing prompt

When replacing Commitizen, Czg, or a local prompt script:

1. Install Commitprompt and set `"commit": "commitprompt"` in `package.json`.
2. Remove the old prompt package and adapter, such as `commitizen`,
   `cz-conventional-changelog`, or `czg`.
3. Remove the obsolete `config.commitizen` package metadata or local prompt
   script.
4. Keep the repository's Commitlint configuration. Commitprompt loads it
   directly and includes conventional defaults when it is absent.
5. Keep any `commit-msg` hook that enforces messages created outside
   Commitprompt. Keep `pre-commit` and `pre-push` hooks for their existing staged
   file and repository checks.

No package-manager command belongs inside the `commit` script. The neutral
binary works through `pnpm commit`, `npm run commit`, and `yarn commit`.

## Git hooks

`commitprompt setup project` installs the canonical Husky hook:

```sh
commitprompt validate --input "$1"
```

The hook validates messages created directly by Git, Zed, or VS Code and blocks
the commit when repository rules fail. Existing unrelated hook commands are
preserved. A `pre-commit` hook runs before the message exists and is better
suited to staged-file checks.

The neutral command is preferred because Husky places `node_modules/.bin` on
`PATH`. Equivalent explicit commands are:

```sh
npx --no-install commitprompt validate --input "$1"
pnpm exec commitprompt validate --input "$1"
yarn exec commitprompt validate --input "$1"
```

When validation fails, Commitprompt identifies the violated rules, states that
the commit was blocked, and tells the author to correct the message in Zed or
VS Code. Do not use `--no-verify` to force it through.

## AI instruction assets

Project setup writes guarded `AGENTS.md` and GitHub Copilot sections from one
canonical source. It also installs reusable Commitprompt skills at
`.agents/skills/commitprompt/SKILL.md` and
`.claude/skills/commitprompt/SKILL.md`. Versioned copies ship in the package
under `templates/` for tools that need to inspect or copy the assets directly.

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
  runCommitFlow,
  setupProject,
  setupWorkspaceEditors
} from '@santi020k/commitprompt'
```

The package is ESM-only. Every value and type exported from the package root is
part of the stable public API and follows semantic versioning. Files below
`dist/` and source-file paths are implementation details and are not supported
entry points.

- `formatCommitMessage(answers)` formats structured fields without touching Git.
- `createCommitlintValidator(cwd)` returns cached `validate(message)`,
  `getTypes()`, and `getScopes()` operations.
- `createGitClient(cwd, options?)` checks the index and creates commits without
  using a package-manager-specific command.
- `runAutomation(options)` powers structured discovery, formatting, validation,
  and explicitly confirmed commit operations.
- `runCommitFlow(options)` composes prompts, validation, confirmation, and Git
  operations for custom interactive integrations.
- The editor setup functions update Zed or VS Code settings while preserving
  unrelated configuration.
- `setupProject(options)` creates package metadata, enforcement, guarded agent
  instructions, and reusable skill files.
- `setupWorkspaceEditors(options)` creates tracked, repository-aware Zed and
  VS Code instructions and supports non-writing drift checks.

Commitprompt requires Node.js 22.18 or newer. Within a major version, additions
may extend returned objects, exported unions, or optional options; existing
documented behavior and required inputs will not change incompatibly.

## License

MIT. Published artifacts bundle the Commitlint lint engine and include its
generated third-party notices in `dist/THIRD_PARTY_LICENSES.txt`.
