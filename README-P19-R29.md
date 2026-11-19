# P19 R29: Offline release evidence manifest and delta review

Target repository: `ALENZACODES/access-main`.

Pinned inspection baseline (2026-11-19):

- access-main `e44ce773eaf693db7027638574c50fc8837461a8`
- access-help `ca598991a672befa2dc08b86c33fe36f42f692aa`
- access-maps `2a8b3e1b7100f3e04244fdba66bfe9e3a7ba9c1f`
- access-tools `6f35cecd184fc6e87b44930e2bb67ae7b1574f44`

The ZIP is an overlay: extract its `scripts/release/` files into the **current clean `access-main` main checkout**. None of these files was present on that main when inspected. No pre-existing main files are replaced. No scheduled workflow, dependency, lockfile or CI configuration is supplied.

## New files

- `scripts/release/offline-release-contract.mjs`: strict typed-in-JS release manifest validation, source, licence, ISO dates, canonical tier, allowed claim state, bilingual copy, safe paths, hashes, dependency integrity, privacy checks, canonical serialization and deterministic fingerprints.
- `scripts/release/offline-release-graph.mjs`: topological dependency layers, offline cache-state analysis, reverse impact, orphan and blocked-source impact summaries, entrypoint checks and bounded traces.
- `scripts/release/offline-release-delta.mjs`: before/after source, claim and asset changes, explicit UNKNOWN transitions, guarded comparison, impact analysis and human-review flags.
- `scripts/release/offline-release-export.mjs`: offline-only accessible EN/FR HTML, CSV, JSON and text summaries, with no external resources.
- Matching `*.test.mjs` suites for each above plus `offline-release-policy.test.mjs`.

## Imports and baseline contracts

All new relative inter-module imports are included. Two deliberately reused, **already-existing main** files are not copied: `scripts/release/site-audit.mjs` (the exported `isOpenLicence` and `isValidDate` functions) and `packages/shared/test/forbiddenOrg.ts` (`forbiddenOrgNeedles`). The policy test imports the latter using Node's TypeScript stripping support. The local isolated test run used small stand-ins matching the inspected exports of those existing files; stand-ins are NOT in the archive.

## Verification performed

- `node --test --experimental-strip-types offline-release-*.test.mjs`: **214 passed, 0 failed** against the local isolated test harness.
- `node --check` for all new modules and test files: passed.
- New-module source scan for literal U+00A0 and U+202F: passed. All such spacing in strings is represented with Unicode escapes, preserving rendered spacing.
- `forbiddenOrgNeedles` regression test: passed in isolated harness.
- `npm run lint` attempted at the package build directory: **not executable** because the complete repository root and its dependencies were not available here (`ENOENT package.json`). Full root lint, TS typecheck, axe, build and CI are **not verified**.

## Product and safety boundaries

This is a static evidence and release artifact tool. It does not test real places, certify accessibility, grant benefits eligibility, alter records, fetch URLs, schedule tasks, or store personal data. `UNKNOWN` remains `UNKNOWN`. The presence of a source is not evidence that a physical claim is correct. Users must independently review findings.

The manifest is deliberately explicit and strict: unknown claims are accepted with no source IDs, but affirmative and negative claims need source references. Source licences and retrieval dates are required. A source reviewer status is not an endorsement. Findings are structural and do not by themselves prove that a web app is usable offline or meets WCAG.
