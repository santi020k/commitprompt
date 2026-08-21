---
"@santi020k/commitprompt": minor
---

Accept comments and trailing commas when adding commit-generation instructions to VS Code settings.

Add `commitprompt setup project` to configure the development dependency, package script, Husky commit-message validation, and guarded AI instructions. Include check, dry-run, and JSON output modes for automation. Setup detects and reports the repository package manager without invoking it, leaving dependency installation and lockfile updates under explicit user control.

Add repository-aware workspace editor setup, published AI instruction templates, reusable agent skills, and clearer blocked-commit diagnostics.

Load JavaScript, JSON, YAML, and native Node.js TypeScript Commitlint configuration without the transitive TypeScript loader, removing its mandatory TypeScript peer warnings from minimal Yarn consumers.

Bundle the Commitlint lint engine with generated third-party license notices, reducing the installed dependency surface and removing Yarn Classic's transitive `es-toolkit` manifest warning.
