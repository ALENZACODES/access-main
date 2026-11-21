# P19 R36 — Offline Degradation Drill

Baseline (rechecked): access-main 8f411acbbe7bd8caccc55e55cde78c742ed7ecaf; access-help 419c7a085e51bca54c3f32b0430b8e3cadefcb0e; access-maps bac3821bfab7e62a4721b6745cd71cfce8860ee6; access-tools 6f35cecd184fc6e87b44930e2bb67ae7b1574f44.

## Contents

All paths are relative to access-main. Twelve new `scripts/release/offline-drill-*.mjs` source, test and fixture modules, plus three complete replacements: `scripts/release/offline-acceptance-report.mjs`, `scripts/release/offline-acceptance-report.test.mjs`, and `scripts/release/package.json`.

The report now calls the source tier **Source review tier** in English. The data field `tier` remains unchanged. Its existing test was updated to assert the new wording.

The manual `npm run drill -- --input local.json --format html --language fr` command performs local inspection; it does not contact outside services or run in the background. Exports are deterministic and create-only when writing files. UNKNOWN remains UNKNOWN. Captured tests do not establish physical accessibility.

## Test results

- New feature: 208 Node tests pass.
- Existing acceptance-report suite after label update: 48 Node tests pass.
- Combined: 256 tests pass, zero failed.
- Node syntax checks: pass.
- Manual CLI mount: pass (`npm run drill -- --help`).
- Source policy scans: no forbidden organisation names, prohibited display claims, raw U+00A0/U+202F characters, symlinks or large files.

Full repository lint, application typecheck, browser axe checks, and CI could not be run without a full checkout and dependencies. Those are still integration gates. A local stand-in for the preexisting `site-audit.mjs` was used for the focused tests; it is deliberately omitted from this ZIP because the repository owns that file.

## Constraints

No scheduled workflows, third-party requests, secrets, saved personal data, or automated accessibility conclusions. Each source, capture and exported claim carries or references the required source, licence, retrieval date and source tier. French reports use escaped U+00A0 before colons and U+202F where applicable.
