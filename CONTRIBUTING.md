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

### Git hooks

The `quality` command is a native CLI installed separately from pnpm dependencies.
Install it using the [Quality installation guide](https://github.com/santi020k/quality#install-for-development),
then verify that it is available on your `PATH` and install this repository's hooks:

```sh
quality --version
pnpm run hooks:install
quality hooks status
```

The managed hooks run staged-file checks, Commitprompt message validation, and
the full pre-push gate defined in `quality.yml`. Re-run `pnpm run hooks:install`
after changing that configuration. Do not bypass a failing hook.

## Affected pull request checks

Ordinary PRs limited to documentation source, public assets, browser tests, or `docs/` use
Turbo's `commitprompt-docs...` filter for build, typecheck, lint, coverage, and export checks.
Documentation browser tests, repository lint, spelling, Knip, and the dependency audit still run.
CLI changes, shared configuration, manifests, unknown paths, missing history, pushes, manual runs,
and release branches keep the full task set, packed consumers, Node 24, and Windows validation.
The full `pnpm run validate` command and pre-push hook remain unchanged in scope.

Run `pnpm run test:ci` for the selector regression tests. To inspect a local plan, set
`CI_BASE_SHA` to the intended base and run `node scripts/ci-scope.mjs`; `--full` forces the full plan.
The comparison uses the merge base, includes deleted paths and both sides of renames, and combines
committed, staged, unstaged, and untracked paths unless `CI_HEAD_SHA` selects an explicit commit.
Git environment overrides cannot redirect that comparison. Uncertain history means full validation.

The rollout updates vulnerable Storybook, Zod, Undici, and URI parser dependencies within their
existing major versions. Remove the scoped overrides when upstream ranges resolve patched versions.
Rollback is a corrective PR restoring full checks; never bypass release validation or replace
published version tags.

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

## Published package verification

Release CI runs `pnpm run verify:published` after publication to verify the
package version, latest tag, and installed consumer workflows.
`NPM_VERIFY_ATTEMPTS` accepts a positive integer and defaults to 6.
`NPM_VERIFY_DELAY_MS` accepts a finite nonnegative delay in milliseconds and
defaults to 2000; zero allows immediate retries. Each retry multiplies the
initial delay by its attempt number. The initial delay and every scheduled
retry must stay at or below 2147483647 milliseconds, Node's timer limit.
Fractional milliseconds follow Node's timer behavior: delays are truncated to
whole milliseconds, with a minimum timer delay of 1 millisecond. Invalid retry
settings fail before invoking npm.

## Documentation deployment

The CI workflow deploys documentation from `main` only after the required
validation jobs succeed. A manual dispatch from another branch validates it
without deploying. Production credentials are fetched through the existing
Infisical OIDC identity in the protected `docs-production` environment.

After deploying, CI checks the home page, documentation page, and sitemap over
HTTP. Failed smoke checks fail the deployment job and required checks; inspect
the deployment and restore service through a corrective pull request and CI run.
The smoke checks confirm availability and expected content, not the deployed
commit identity.

### Rollout benchmark

A local macOS/Node 22.23.1 run compared the Node 22 CI commands for the same docs
page edit, including audit, selector tests, browser tests, Turbo checks, repository
checks, and the packed consumer when required. With separate empty task caches,
full validation took 25.55 s and affected validation took 23.46 s (8.2% less).
Two alternating warm-cache runs had medians of 9.41 s and 2.03 s
(78.5% less), largely by avoiding the unchanged CLI consumer check.
Installation, browser downloads, and the Node 24/Windows jobs are excluded; compiler
caches were prewarmed equally and remote caching was disabled. These measurements
establish local task savings, not a prediction of total hosted CI duration.
