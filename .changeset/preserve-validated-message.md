---
"@santi020k/commitprompt": patch
---

Commit with `--cleanup=verbatim` so a validated commit message is stored exactly as generated, even when the consumer's Git configuration sets `commit.cleanup` to `strip` or `scissors`.
