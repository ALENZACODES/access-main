# P20AF – Offline Journey, Resource and Bilingual Accessibility Contracts

This lane adds independent, read-only contracts for offline route transitions and recovery. No source file mounts into the product UI; Playwright automatically discovers `p20af-offline-live.spec.ts`, and the local node test runner discovers `p20af-*.node.mjs`. The public contract barrel is `p20af-index.ts`.

## Coverage

- `p20af-transition-ledger.ts`: route and locale changes, focus, announcements, evidence provenance, UNKNOWN semantics, and full online/offline route matrix.
- `p20af-resource-audit.ts`: observed request outcome, safe read-only methods, per-entry 524,288-byte cap, total budget, cache claims, mandatory resource dependency graph, and bundle drift.
- `p20af-localized-controls.ts`: accessible names, role/state compatibility, touch targets at least 44 by 44 CSS pixels, tab sequence, modal containment, French punctuation and translated controls.
- `p20af-fallback-decisions.ts`: bounded available/partial/unavailable/UNKNOWN fallbacks, immutable evidence source fields, review and local export affordances, bilingual notices.
- `p20af-history-replay.ts`: push, replace, back, forward, locale, disconnection, reconnection, focus, scroll, and history continuity.
- `p20af-browser-observer.ts`: read-only DOM capture. Browser observation never claims a cache hit or source fact based on DOM absence.
- `p20af-offline-live.spec.ts`: smoke test in EN/FR and 320px/1280px. Uses the existing `appRoutes()` and `chooseLanguage()` helper and does not duplicate full-route axe scans.
- Six Node suites exercise normal and failure cases including cross-contract transitions, with no fixture-dependent real-place claims.

## Integration

Copy the included `access-main/apps/web/e2e` files to the matching repository paths. Existing router, service worker, settings, production source files, and caches are not modified. No scheduled workflows, secrets, symlinks, or network persistence are added.

Root `PR-BODY.md` remains tracked in the examined upstream main. The supplied `access-main/patches/remove-tracked-root-pr-body.patch` is a delete-file patch. Apply this deletion to the repo; the ZIP intentionally does not include a root PR-BODY file.

## Test notes

The focused Node suites run with Node 22 TypeScript stripping. The E2E test is discovered by the repository Playwright project; it has not been run against a built local app in the isolated working environment. The independent strict TypeScript pass uses temporary Playwright declaration stubs, not a full repo install. Re-run repository lint, typecheck, build, unit suites, Playwright and precache checks in CI. The package cannot certify those full gates by itself.
