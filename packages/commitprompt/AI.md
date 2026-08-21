# Commitprompt for AI agents

Commitprompt formats and validates Conventional Commit messages with the rules
of the current repository. Use its non-interactive commands instead of driving
the terminal questionnaire.

## Safe workflow

1. Inspect the repository instructions, status, staged diff, and unstaged diff.
2. Do not stage files unless the user asked you to.
3. Read the allowed commit types and configured scopes:

   ```sh
   commitprompt types --json
   commitprompt scopes --json
   ```

4. Read the generation instructions:

   ```sh
   commitprompt instructions --json
   ```

5. Create a JSON object with all six string fields:

   ```json
   {
     "type": "feat",
     "scope": "cli",
     "subject": "accept structured input",
     "body": "",
     "breaking": "",
     "issues": ""
   }
   ```

6. Format it without changing the repository:

   ```sh
   commitprompt format --json < commit.json
   ```

7. Validate a complete message against the repository:

   ```sh
   commitprompt validate --json < message.txt
   ```

8. Only when the user has authorized creating a commit, format, validate, and
   commit the staged changes:

   ```sh
   commitprompt commit --yes --json < commit.json
   ```

`commit --yes` requires staged changes, rejects invalid messages, and then calls
Git normally. Git hooks remain active. Never use `--no-verify` to bypass them.

## Repository setup assets

`commitprompt setup project` installs guarded agent instructions, reusable
skills, and the enforcing `commit-msg` hook. `commitprompt setup editors`
creates tracked Zed and VS Code instructions using the repository's configured
types and scopes. Both commands support `--dry-run`, `--check`, `--json`, and
`--cwd <path>` for automation and drift detection.

The published package also includes reusable templates for `AGENTS.md`, GitHub
Copilot instructions, and `SKILL.md` under `templates/`.

## Input contract

`format` and `commit` accept one JSON object from standard input. Every field is
required and must be a string. Use an empty string for omitted optional content.

- `type`: allowed change type; consult `types --json`
- `scope`: optional affected area; consult `scopes --json` when it is non-empty
- `subject`: concise imperative description
- `body`: optional longer explanation
- `breaking`: optional breaking-change explanation
- `issues`: optional issue references such as `Closes #123`

Use `--input <path>` instead of stdin when input already exists in a file. Use
`--cwd <path>` with `instructions`, `scopes`, `types`, `validate`, or `commit`
when the target repository is not the current working directory.

## Exit and output contract

- Exit `0`: formatting succeeded, validation passed, or the commit was created.
- Exit `1`: invalid input, failed validation, missing staged changes, Git
  failure, configuration failure, or unsafe invocation.
- `--json` writes one JSON value to standard output on success.
- `--json` writes `{"error":"..."}` to standard error for operational errors.
- An invalid `validate --json` call returns its validation object and exits `1`.
- An invalid `commit --json` call returns `committed: false`, the formatted
  message, and its validation object, then exits `1`.

## Repository instruction snippet

Projects can add this to `AGENTS.md` or an equivalent agent-instruction file:

```md
## Commits

Use the installed `commitprompt` binary for commit messages. Run
`commitprompt types --json` and `commitprompt scopes --json` before generating a
message, pass structured JSON to `commitprompt format --json`, and validate it with
`commitprompt validate --json`. Only run `commitprompt commit --yes --json` when
the user explicitly asks you to create the commit. Never stage unrelated files
or bypass Git hooks.
```
