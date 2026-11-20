# P20AM — Offline Recovery Rehearsal and Accessibility Trace Diffing

This round is scoped to the P20 journey / E2E lane. It does not supply, infer, or alter any accessibility attributes of real places. Its model records only observed application state. A missing value remains `UNKNOWN`; unknown cache availability is not evidence of an available resource.

## Mounts and exports

- `p20am-index.ts` exports the complete pure contracts, copy and custody helpers, plus the read-only browser adapter.
- `p20am-live.spec.ts` is discovered by the existing Playwright `*.spec.ts` loader. It consumes `appRoutes()` from the current application's route helper, checks both EN and FR, and runs at 320px and 1280px. It makes no persistent storage writes. Offline simulation uses Playwright's context and is always reverted.
- Root `package.json` adds the six new `p20am-*.node.mjs` suites to `test:scripts`, preserving all existing entries.

## Scope

- Trace replay contracts: disconnection, reconnection, language switching, navigation, focus preservation, dialog boundaries, and history restoration.
- Read-only keyboard control observations, accessible names, 44px target size, and status announcements.
- Cached resource evidence and explicit budget checks; unknown byte measurements never count as passing evidence.
- Source, licence, retrieved-on date, tier, and value custody across preserving actions.
- Deterministic text, CSV and JSON evidence handoff. CSV escapes formula-like fields; JSON readback validates the schema and route before accepting it.
- EN/FR copy with correct French punctuation and localized control-name selectors.

## Checks

Local focused tests are Node's built-in test runner with `--experimental-strip-types` on Node 22. Standalone strict TypeScript includes `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters`. These checks do not substitute for the full repository's `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`, production build or precache-budget gate.

No `PR-BODY.md`, lockfile changes, schedules, background workflows, external service credentials or synthetic place claims are included.
