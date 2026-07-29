<p align="center">
  <img src="apps/docs/public/logo.svg" alt="Commitprompt" width="440" />
</p>

# Commitprompt

Write the commit. Not the syntax.

Commitprompt is a focused, package-manager-neutral prompt for Conventional
Commits. It checks staged changes, guides the author through the message,
validates with included Commitlint rules or the repository's own configuration,
previews the result, and commits only after confirmation.

## Install

```sh
pnpm add --save-dev commitprompt
npm install --save-dev commitprompt
yarn add --dev commitprompt
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
