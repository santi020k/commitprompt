---
"@santi020k/commitprompt": patch
---

Stop silently loading a package's root entry point when an extended configuration, parser preset, or plugin specifier requests a missing subpath, including packages without an `exports` map. Preserve valid legacy subpath imports and resolve consumer-local import-only array exports without falling back to unrelated legacy entry points. Skip invalid array targets consistently with Node, including traversal and reserved node_modules paths.
