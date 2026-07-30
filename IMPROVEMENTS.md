# Commitprompt next-release improvements

This document records the v1 adoption findings, what is implemented for the
next release, and the remaining work that should guide a later iteration.

## Implemented for the next release

### Valid VS Code JSONC

- VS Code settings accept comments and trailing commas at every nesting level.
- Existing formatting, comments, custom instructions, and model preferences are
  preserved.
- Realistic exported settings and repeat-run idempotency are covered by tests.

### Repository setup

`commitprompt setup project` now:

- detects npm, pnpm, or Yarn from repository metadata and lockfiles;
- adds Commitprompt and Husky development dependencies;
- respects pnpm workspace catalogs;
- sets the neutral `commitprompt` package script;
- installs the canonical `commit-msg` validation hook while preserving
  unrelated hook commands;
- updates the dependency installation and lockfile with the detected package
  manager;
- writes guarded AGENTS.md and GitHub Copilot instructions;
- installs reusable Commitprompt skills for common agent layouts;
- reports obsolete Commitizen, Czg, and custom prompt configuration without
  deleting it.

The command supports independent `--only` actions, `--check`, `--dry-run`,
`--json`, `--cwd`, and `--skip-install`.

### Repository-aware editor instructions

`commitprompt setup editors` writes tracked VS Code and Zed workspace settings
using the repository's configured types and scopes. It preserves user-authored
instructions, never writes machine-specific model preferences, and supports
editor selection plus check, preview, JSON, and alternate-working-directory
modes.

### Hook diagnostics and AI assets

- Invalid hooks explicitly state that the commit was blocked, list violated
  rules, and provide a correction-and-retry workflow.
- npm, pnpm, and Yarn hook examples use the same canonical validation command.
- A real Husky integration test accepts a valid message and rejects an invalid
  one.
- Versioned AGENTS.md, GitHub Copilot, and agent-skill templates ship from one
  canonical source.
- The instructions require repository and diff inspection, type and scope
  discovery, structured formatting, exact validation, explicit authorization,
  and normal Git hooks.

### Release verification

The consumer smoke test installs the artifact with npm, pnpm, and Yarn and
checks:

1. the interactive binary;
2. `types`, `scopes`, `instructions`, `format`, and `validate`;
3. realistic VS Code and Zed JSONC;
4. project and editor setup idempotency;
5. generated hook enforcement;
6. published templates, declaration maps, and source maps.

Published-package verification also checks the npm `latest` dist-tag and runs
the same consumer workflow against the registry artifact.

## Remaining improvement: isolate Commitlint's TypeScript loader

Yarn 1 reports unmet `@types/node` and `typescript` peers from
`cosmiconfig-typescript-loader`, a transitive dependency of `@commitlint/load`.
Version 6.3.0 declares both peers as mandatory and provides no
`peerDependenciesMeta` entries.

Adding TypeScript and its Node types to Commitprompt would silence the warning,
but would violate the dependency-light goal for JavaScript-config consumers.
The warning is therefore documented rather than hidden.

For a later release, evaluate these options in order:

1. contribute optional peer metadata or lazy TypeScript loading upstream;
2. adopt an upstream Commitlint release after it makes the peers optional;
3. isolate configuration loading behind an optional adapter while retaining
   JavaScript configuration support by default.

Acceptance remains: minimal npm, pnpm, and Yarn consumers install without
dependency warnings and without adding TypeScript to Commitprompt's default
runtime dependencies.

## Candidates for the following release

- Add an explicitly confirmed cleanup mode for obsolete Commitizen/Czg
  dependencies and configuration.
- Detect monorepo roots when setup starts from a nested workspace package and
  report which manifest, catalog, and hook will be changed.
- Add a setup report format suitable for pull-request annotations.
- Explore editor-native validation feedback so generated messages can be
  corrected before Git invokes the authoritative hook.
