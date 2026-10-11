---
"@santi020k/commitprompt": patch
---

Preserve manifest indentation, CRLF line endings, and trailing newline choices
when setup changes package.json. Leave semantically correct Quality hooks
untouched, including authored flow sequences, block names, comments, and metadata.
Update stale Commitprompt steps in place while preserving unrelated fields and
comments, and reject malformed hook structures before writing project files.
