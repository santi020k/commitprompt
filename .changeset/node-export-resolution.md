---
"@santi020k/commitprompt": patch
---

Decode file URL export targets when loading consumer configurations, including
encoded Unicode, spaces, and wildcard matches. Resolve conditional exports in
declaration order and respect blocked targets instead of loading a later sibling.

Configurations with only a `module` export condition must use `import` or
`default`, matching Node's standard import conditions. Legacy top-level `module`
metadata remains supported when no exports map is present.
