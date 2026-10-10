---
"@santi020k/commitprompt": patch
---

Detect orphaned, reversed, or duplicated Commitprompt markers in Zed's `commit_message_instructions` before reusing the managed section, preventing a corrupted guarded block from being silently merged or overwritten.
