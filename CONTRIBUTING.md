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
