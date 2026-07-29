# Commitprompt

Write the commit. Not the syntax.

Commitprompt is a focused, package-manager-neutral prompt for Conventional
Commits. It checks staged changes, guides the author through the message,
validates against the repository's own Commitlint configuration, previews the
result, and commits only after confirmation.

## Install

```sh
pnpm add --save-dev commitprompt @commitlint/config-conventional
```

```json
{
  "scripts": {
    "commit": "commitprompt"
  }
}
```

Then stage your intended changes and run `pnpm commit`.

## Repository

- `packages/commitprompt` — public CLI and programmatic API
- `apps/docs` — Astro documentation website built with Lumen

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
