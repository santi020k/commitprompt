---
"@santi020k/commitprompt": patch
---

Configure commit-message validation as an idempotent `quality.yml` hook step
instead of installing Husky. Preserve unrelated quality hook steps and select
the repository's npm, pnpm, or Yarn invocation automatically.
