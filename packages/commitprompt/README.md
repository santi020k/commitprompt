# Commitprompt

A focused, package-manager-neutral prompt for Conventional Commits.

## Install

```sh
pnpm add --save-dev commitprompt
npm install --save-dev commitprompt
yarn add --dev commitprompt
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

Commitprompt includes Conventional Commits validation, so a separate Commitlint
configuration is optional. When the repository defines `type-enum`,
Commitprompt uses those values in the type prompt.

## Usage

Stage the intended changes, then run the package script:

```sh
git add src/
pnpm commit
```

The body accepts multiple lines. Submit an empty line to finish it. Invalid
messages can be revised without restarting Commitprompt.

## Requirements

- Node.js 22.18 or newer
- Git
- At least one staged change

## Repository rules

Add a Commitlint configuration only when the repository needs to extend or
override the included conventional defaults:

```js
export default {
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'release']]
  }
}
```

## Programmatic API

```ts
import {
  createCommitlintValidator,
  createGitClient,
  formatCommitMessage,
  runCommitFlow
} from 'commitprompt'
```

The message formatter, default commit types, Git adapter, cached Commitlint
client, prompt helpers, and full commit flow are exported for integrations and
testing. The Commitlint client exposes `validate(message)` and `getTypes()`.

## License

MIT
