---
"@santi020k/commitprompt": patch
---

Resolve `extends` and parser preset specifiers through import-only packages that
declare wildcard subpath exports (for example `"./presets/*": { "import":
"./configs/*.mjs" }`), matching Node's own precedence: exact keys first, then the
most specific overlapping pattern, with substituted matches rejected if they
would traverse outside the package. Preserve dollar characters literally during
substitution, reject empty matches and encoded path separators, and honor exact
null exclusions and conditional array targets.
