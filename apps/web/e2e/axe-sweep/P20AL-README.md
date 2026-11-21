# P20AL — Offline journey evidence conformance

P20AL is an unbranded read-only E2E policy and audit package. It does not assess any Ontario location or represent an accessibility claim about a real place. All sample records in the Node tests are invented fixtures and must not be imported into application data.

## Mainline integration

- `p20al-index.ts` is the export barrel for every new P20AL source module; existing P20 barrels are not replaced.
- `p20al-live.spec.ts` is discovered by the existing Playwright test runner in `apps/web/e2e`.
- The live route inventory calls `appRoutes()` from `../a11y-input/helpers` and never assumes a fixed total.
- Root `test:scripts` keeps every existing mainline entry and appends three P20AL Node suites.
- No scheduled job, keep-awake ping, external service, storage mutation or user identity is required.

## Coverage

The model checks local route identity, provenance completeness, record drift, screen continuity, dialog focus, size thresholds, announcements, cache evidence and bounded reports. Unknown network, cache, measurements and provenance remain UNKNOWN or null. A missing observation never counts as a passing measurement.

The handoff format exports only explicitly supplied evidence fields in text, CSV and JSON. Spreadsheet formula prefixes are escaped. JSON imports are schema-checked, and known status without complete metadata is downgraded to UNKNOWN on export.

The matrix planner produces EN/FR, 320px/1280px, online/offline, phase-specific audit cells. The live smoke test checks a representative home-page network transition without running a second complete axe crawl. The existing full-route axe checks remain responsible for WCAG accessibility scanning.

## Verification

The P20AL Node regression suite can run with Node 22 and `--experimental-strip-types`. A standalone strict TypeScript check verifies the new TS files; the full repository lint, build, Playwright, and precache build gates must be rerun after application.

Do not copy any root `PR-BODY.md`. If a tracked root copy remains, delete it separately during integration.
