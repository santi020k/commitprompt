# Contributing

Thank you for improving Commitprompt.

## Setup

Use Node.js 22.19 or newer and the pnpm version declared in `package.json`
for repository development. The published CLI supports Node.js 22.18 or newer:

```sh
pnpm install
pnpm run validate
```

The CLI lives in `packages/commitprompt`; the website lives in `apps/docs`.
Keep Git operations, validation, message formatting, and terminal interaction
separated and covered by tests.

## Documentation design

The documentation uses Lumen v4 and preserves Commitprompt’s yellow/gold and
teal identity. Follow [the documentation style guide](docs/design-guide.md)
for page structure, semantic tokens, motion, and browser verification.

## Changesets

Run `pnpm changeset` for user-visible package changes. Choose patch, minor, or
major according to semantic versioning and describe the effect for users.

## Pull requests

Use a Conventional Commit title, keep changes focused, and include tests for
behavior changes.
