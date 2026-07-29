# Commitprompt

A focused, package-manager-neutral prompt for Conventional Commits.

## Install

```sh
pnpm add --save-dev commitprompt @commitlint/config-conventional
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

## Requirements

- Node.js 22.18 or newer
- Git
- A Commitlint configuration in the consuming repository

## Programmatic API

The message formatter, default commit types, Git adapter, Commitlint adapter,
and full commit flow are exported for advanced integrations and testing.

## License

MIT
