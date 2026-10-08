<p align="center">
  <a href="../../README.md">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/workspace-dark.svg">
      <img src="../../docs/assets/readme/workspace-light.svg" alt="Commitprompt — Write the commit. Not the syntax." width="1200" height="220">
    </picture>
  </a>
</p>

<h1 align="center">Documentation</h1>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-13967e?style=flat-square" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/built_with-Astro-877006?style=flat-square" alt="Built With: Astro"></a>
</p>

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

| Area                       | Responsibility                    |
| -------------------------- | --------------------------------- |
| [src/pages](src/pages)     | Landing page and documentation.   |
| [src/layouts](src/layouts) | Shared page shell and metadata.   |
| [scripts](scripts)         | Social image generation.          |
| [tests](tests)             | Browser and accessibility checks. |

## Verify documentation

Run the workspace type check and build after editing Astro pages. Use `test:a11y` for rendered
interaction changes. README-only edits do not regenerate social images.

## Workspace commands

Run from the repository root after its documented setup. Use the Node.js and pnpm versions
declared in the root [package.json](../../package.json).

| Task                            | Command                                         |
| ------------------------------- | ----------------------------------------------- |
| Start local development         | `pnpm --filter commitprompt-docs run dev`       |
| Build or compile this workspace | `pnpm --filter commitprompt-docs run build`     |
| Lint this workspace             | `pnpm --filter commitprompt-docs run lint`      |
| Check types                     | `pnpm --filter commitprompt-docs run typecheck` |
| Run workspace tests             | `pnpm --filter commitprompt-docs run test`      |

## Resources

[Project overview](../../README.md) · [Contributing](../../CONTRIBUTING.md) · [License](../../LICENSE)
