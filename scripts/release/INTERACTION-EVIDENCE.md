# Offline interaction evidence replay (P19)

This module accepts **manually captured** observations for the App's pages. It does not inspect real places, take measurements from a live browser, send files, or certify WCAG conformance. A `PASS` is a **recorded measurement**, not a conclusion about all controls on a page.

The explicitly invoked `audit:interaction-evidence` command reads a local JSON snapshot passed via `--after`. It supports an earlier snapshot via `--before` and an optional brand-new local report path via `--output`. Exports are English/French HTML, CSV, JSON, and plain text. The tool performs no network operations, and refuses symbolic-link inputs and overwrites.

### Data contract

Root: `schemaVersion: 1`, `capturedOn` (YYYY-MM-DD), and `routes` (bounded array). Each route requires `id`, `path`, `language` (`en`/`fr`), `checks`. Each check requires `id`, `kind`, `result` (`PASS`/`FAIL`/`UNKNOWN`), `source`, `licence`, `retrievedOn`, and `verificationTier`. Optional observation fields depend on the kind.

- Touch-target checks record `width` and `height` in pixels. `PASS` requires both to be at least 44, otherwise it is rejected.
- Focus uses `focusVisible` as a recorded boolean.
- Keyboard uses `keyboardReachable` as a recorded boolean.
- Screen reader and status message use `announced` as a recorded boolean.
- Accessible-name uses `accessibleName`; an explicit empty name can record `FAIL`, but never `PASS`.

Missing observations stay `UNKNOWN`; the validator never creates a positive result. A record contains provenance regardless of outcome. The optional digest is *metadata provided by the source*, not a signature or an authenticity guarantee. Its format is checked but its origin is not independently verified.

The analysis produces source-age flags, unknown-result flags, missing-language and missing-kind flags, and a human-review queue. The comparison detects additions, removals, source changes and recorded PASS-to-FAIL transitions while keeping transitions involving `UNKNOWN` indeterminate. HTML exports include a main landmark, skip link, language tag and visible focus; CSV protects leading formula characters.

No PWA files, runtime routes, service worker caching, install-budget checks, timeout rules, workflows or scheduled actions are modified. The code runs in Node on explicit invocation and is not part of the first-install payload.
