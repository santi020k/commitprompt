# @santi020k/commitprompt

## 1.0.0

### Major Changes

- [#13](https://github.com/santi020k/commitprompt/pull/13) [`17fe261`](https://github.com/santi020k/commitprompt/commit/17fe2619fa99cddf30550e15403e43ae6b7dbfc9) Thanks [@santi020k](https://github.com/santi020k)! - Release Commitprompt 1.0 with a stable ESM CLI and programmatic API for
  interactive Conventional Commits, repository-aware validation, editor setup,
  and explicitly authorized automation workflows.

### Minor Changes

- [#13](https://github.com/santi020k/commitprompt/pull/13) [`4e693f0`](https://github.com/santi020k/commitprompt/commit/4e693f0b44ce412fab9770556339e8dc60db12c2) Thanks [@santi020k](https://github.com/santi020k)! - Use repository `scope-enum` values in interactive prompts and AI instructions,
  and expose configured scopes through `getScopes()` and `commitprompt scopes`.

### Patch Changes

- [#13](https://github.com/santi020k/commitprompt/pull/13) [`f229070`](https://github.com/santi020k/commitprompt/commit/f229070bccf5fdba33f090af06e7edf389fa4b70) Thanks [@santi020k](https://github.com/santi020k)! - Harden editor setup with shared atomic settings updates, clarify when built-in
  Commitlint rules are used, and expand executable and cross-platform package
  coverage.

- [#13](https://github.com/santi020k/commitprompt/pull/13) [`d4fe101`](https://github.com/santi020k/commitprompt/commit/d4fe1013f1004959d5feb201bb98db64a9c16764) Thanks [@santi020k](https://github.com/santi020k)! - Preserve the Node shebang in the compiled CLI so package consumers can execute
  the published binary directly.

- [#13](https://github.com/santi020k/commitprompt/pull/13) [`40d5483`](https://github.com/santi020k/commitprompt/commit/40d548322190181ee96d9d76b29682033fb3d780) Thanks [@santi020k](https://github.com/santi020k)! - Keep the familiar curated prompt order when a repository uses the standard
  Conventional Commits type set, while preserving repository-defined type sets,
  and document migration from Commitizen, Czg, or a local prompt.

- [#13](https://github.com/santi020k/commitprompt/pull/13) [`0dc1e8a`](https://github.com/santi020k/commitprompt/commit/0dc1e8aeb4efd1eff481bf08d7f32046a6d1d1fd) Thanks [@santi020k](https://github.com/santi020k)! - Publish source maps with the compiled package and protect the stable v1 root API
  with an explicit compatibility contract.

- [#13](https://github.com/santi020k/commitprompt/pull/13) [`fbeec53`](https://github.com/santi020k/commitprompt/commit/fbeec53ccb17fdbe56e17fa807f4f627d0a967c4) Thanks [@santi020k](https://github.com/santi020k)! - Use repository-defined commit types in automation instructions and reject unconfirmed automated commits before reading input.

## 0.2.1

### Patch Changes

- [#9](https://github.com/santi020k/commitprompt/pull/9) [`7840f0a`](https://github.com/santi020k/commitprompt/commit/7840f0a536101c2fad9129d2aa8c5e6c9c4aba64) Thanks [@santi020k](https://github.com/santi020k)! - Support trailing commas when configuring Zed JSONC settings.

## 0.2.0

### Minor Changes

- Add machine-readable `instructions`, `types`, `format`, `validate`, and
  explicitly confirmed `commit` commands for AI agents, ship an AI integration
  guide, and publish LLM-readable documentation discovery files.

## 0.1.1

### Patch Changes

- [`a1486d2`](https://github.com/santi020k/commitprompt/commit/a1486d25748bba2043e60c6485b2c35e1c3e6833) Thanks [@santi020k](https://github.com/santi020k)! - Publish Commitprompt under the `@santi020k` npm scope and update installation and programmatic API examples for the scoped package name.

## 0.1.0

### Minor Changes

- [`c9a9f36`](https://github.com/santi020k/commitprompt/commit/c9a9f36151277ad7d2f619bff8a9d8018ab550ef) Thanks [@santi020k](https://github.com/santi020k)! - Release the first public version of Commitprompt with repository-aware
  Commitlint validation, staged-change checks, message previews, and a neutral
  cross-package-manager binary.

- [`cdfd985`](https://github.com/santi020k/commitprompt/commit/cdfd9857d66496a2ab8ff0dbba0b4073f119159e) Thanks [@santi020k](https://github.com/santi020k)! - Use built-in Conventional Commits validation when a repository has no
  Commitlint configuration, derive prompt types from repository rules, allow
  invalid messages to be revised, and support multiline commit bodies.

- [`91f3536`](https://github.com/santi020k/commitprompt/commit/91f353606aafde2b295d2ad1f4a23391e215c56b) Thanks [@santi020k](https://github.com/santi020k)! - Add `commitprompt setup zed` and `commitprompt setup vscode` to configure the
  editors' native commit-message generators for Conventional Commits across every
  project.

### Patch Changes

- [`bce0fa8`](https://github.com/santi020k/commitprompt/commit/bce0fa88c62299f1b0f2e5926dbbaab6b9a461b8) Thanks [@santi020k](https://github.com/santi020k)! - Resolve Zed and VS Code settings paths with the target platform's path syntax so editor setup works consistently across operating systems.
