<p align="center">
  <a href="../../README.md"><img src="public/logo.svg" alt="Commitprompt" width="300"></a>
</p>

<p align="center"><a href="../../README.md">Commitprompt</a></p>

<h1 align="center">Documentation</h1>

<p align="center">
  <a href="../../README.md">Project overview</a> ·
  <a href="package.json">Package manifest</a> ·
  <a href="#resources">Resources</a>
</p>

**On this page:** [Purpose](#purpose) · [Source map](#source-map) · [Verify documentation](#verify-documentation) · [Workspace commands](#workspace-commands) · [Resources](#resources)

Installation, commit rules, and automation examples for Commitprompt.

## Purpose

This Astro and Lumen site documents the CLI and programmatic API. Keep examples aligned with
the [package guide](../../packages/commitprompt/README.md), where command behavior is documented.

## Source map

| Area | Responsibility |
| --- | --- |
| [src/pages](src/pages) | Landing page and documentation. |
| [src/layouts](src/layouts) | Shared page shell and metadata. |
| [scripts](scripts) | Social image generation. |
| [tests](tests) | Browser and accessibility checks. |

## Verify documentation

Run the workspace type check and build after editing Astro pages. Use `test:a11y` for rendered
interaction changes. README-only edits do not regenerate social images.

## Workspace commands

Run from the repository root after its documented setup. Use the Node.js and pnpm versions
declared in the root [package.json](../../package.json).

| Task | Command |
| --- | --- |
| Start local development | `pnpm --filter commitprompt-docs run dev` |
| Build or compile this workspace | `pnpm --filter commitprompt-docs run build` |
| Lint this workspace | `pnpm --filter commitprompt-docs run lint` |
| Check types | `pnpm --filter commitprompt-docs run typecheck` |
| Run workspace tests | `pnpm --filter commitprompt-docs run test` |

## Resources

[Project overview](../../README.md) · [Contributing](../../CONTRIBUTING.md) · [License](../../LICENSE)
