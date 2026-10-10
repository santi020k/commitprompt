---
"@santi020k/commitprompt": patch
---

Reject malformed VS Code commit-instruction entries and malformed Zed `agent`/`commit_message_instructions` fields with a clear error instead of crashing on null entries or silently overwriting existing settings.
