# AI Working Guide

Commitprompt is a small, dependency-light Conventional Commits prompt.

- `packages/commitprompt` contains the public CLI and programmatic API.
- `apps/docs` contains the Astro documentation site built with Lumen.
- Keep terminal interaction, Git operations, validation, and message formatting
  separated so each can be tested independently.
- Preserve compatibility with npm, pnpm, and Yarn. Never shell out through a
  package-manager-specific command.
- Add a changeset for every user-visible package change.
- Use `pnpm run validate` before release-oriented work.
- Use Lumen primitives and semantic tokens in the documentation app.
