<p align="center">
  <img src="apps/docs/public/logo.svg" alt="Commitprompt" width="440" />
</p>

# Commitprompt

Write the commit. Not the syntax.

[Documentation](https://commitprompt.santi020k.com) ·
[npm](https://www.npmjs.com/package/@santi020k/commitprompt) ·
[Package guide](packages/commitprompt/README.md) ·
[Releases](https://github.com/santi020k/commitprompt/releases) ·
[Issues](https://github.com/santi020k/commitprompt/issues) ·
[Contributing](CONTRIBUTING.md)

[![CI](https://github.com/santi020k/commitprompt/actions/workflows/ci.yml/badge.svg)](https://github.com/santi020k/commitprompt/actions/workflows/ci.yml)
[![CodeQL](https://github.com/santi020k/commitprompt/actions/workflows/codeql.yml/badge.svg)](https://github.com/santi020k/commitprompt/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/@santi020k/commitprompt.svg)](https://www.npmjs.com/package/@santi020k/commitprompt)
[![npm downloads](https://img.shields.io/npm/dm/@santi020k/commitprompt.svg)](https://www.npmjs.com/package/@santi020k/commitprompt)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Commitprompt is a focused, package-manager-neutral prompt for Conventional
Commits. It checks staged changes, guides the author through the message,
validates with included Commitlint rules or the repository's own configuration,
previews the result, and commits only after confirmation.

## Install

```sh
pnpm add --save-dev @santi020k/commitprompt
npm install --save-dev @santi020k/commitprompt
yarn add --dev @santi020k/commitprompt
```

```json
{
  "scripts": {
    "commit": "commitprompt"
  }
}
```

Then stage your intended changes and run `pnpm commit`, `npm run commit`, or
`yarn commit`. Commitprompt supplies Conventional Commits rules by default and
honors the repository's Commitlint configuration when one is present.

Commitlint rules—including disabled length limits, custom types, parser
presets, plugins, and ignores—are covered in the
[package documentation](packages/commitprompt/README.md#repository-rules).
The same guide explains the current
[Git hook boundary](packages/commitprompt/README.md#git-hooks) and
[AI integration API](packages/commitprompt/README.md#automation-and-ai-tools).

AI agents can discover repository types and scopes, format structured input,
validate a message, and create an explicitly authorized commit without driving
the interactive prompt. See the packaged
[AI agent guide](packages/commitprompt/AI.md).

## Editor AI

Run `commitprompt setup zed` or `commitprompt setup vscode` to configure the
editor's native commit-message generator for Conventional Commits across every
project.

## Repository

| Workspace | Purpose | Destination |
| --- | --- | --- |
| [`packages/commitprompt`](packages/commitprompt) | Public CLI and programmatic API | [npm](https://www.npmjs.com/package/@santi020k/commitprompt) · [Package guide](packages/commitprompt/README.md) |
| [`apps/docs`](apps/docs) | Astro documentation website built with Lumen | [Documentation](https://commitprompt.santi020k.com) |

## Development

```sh
pnpm install
pnpm run dev
pnpm run validate
```

User-visible package changes require a Changeset:

```sh
pnpm changeset
```

## License

MIT
