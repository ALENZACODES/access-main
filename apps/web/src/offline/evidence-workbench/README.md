# Offline Evidence Workbench (P19)

This is a manually opened, local-only evidence-note workbench on the existing `/offline` page. The router mounts the existing offline pack page unchanged and adds an explicit open/close control. The large editor is loaded by `React.lazy()` only after a person opens it. No route is added.

A note is a *report about evidence*, not a conclusion about the physical accessibility of a place. `UNKNOWN` means no supported conclusion is available. The review decision describes only the review workflow and does not upgrade the record's evidence status or tier. Every record must contain `source`, `licence`, `retrievedOn` and `tier`; imported JSON is validated before use. Bad or missing fields are rejected rather than invented. All examples use a fictional place identifier.

The panel has a user-initiated JSON file import and explicit JSON, CSV, TXT and HTML exports. Data is held in React state for this session only. There is no server upload, API key, telemetry, local storage, scheduled workflow or keep-awake request. This module does not contact the network. Imported notes replace the current session after the user selects the file; the UI advises exporting the session first.

The export report uses UTF-8, a documented `UNKNOWN` display token, HTML escaping, CSV formula prefixing and self-contained styles. French interface text uses typographic apostrophes, U+00A0 before colons, and U+202F before semicolons, question and exclamation marks when the punctuation is part of authored copy. User-supplied source strings are not rewritten.

Focused tests exercise the versioned validation contract, provenance, malformed inputs, state isolation, manual editing and review history, filter logic, incomplete coverage, cross-place conflict detection, change impact, bilingual exports, CSV formula protections and source-level mount wiring. The domain-model modules are independently TypeScript strict-checkable. Browser axe tests and full monorepo CI still need to run in the actual repo with dependencies and the built PWA.

This change does **not** edit `check-install-budget.ts`, PWA precache exclusions, Vite config, CI timeouts, existing gates or workflows. The editor is a separate on-demand code chunk. Vite's existing service worker configuration still determines whether its chunk is precached; the existing unchanged postbuild install-budget guard must validate the actual total after merging.
