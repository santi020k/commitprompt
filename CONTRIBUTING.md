# Contributing

Thank you for improving Commitprompt.

## Setup

Use Node.js 22.18 or newer and pnpm:

```sh
pnpm install
pnpm run validate
```

The CLI lives in `packages/commitprompt`; the website lives in `apps/docs`.
Keep Git operations, validation, message formatting, and terminal interaction
separated and covered by tests.

## Changesets

Run `pnpm changeset` for user-visible package changes. Choose patch, minor, or
major according to semantic versioning and describe the effect for users.

## Pull requests

Use a Conventional Commit title, keep changes focused, and include tests for
behavior changes.
