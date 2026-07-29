# @santi020k/commitprompt

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
