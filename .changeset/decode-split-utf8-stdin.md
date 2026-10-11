---
"@santi020k/commitprompt": patch
---

Decode stdin incrementally with a streaming UTF-8 decoder so Unicode characters split across Buffer chunks no longer corrupt `format`, `validate`, and `commit` input.
