# P20AG validation record

Baseline: `ALENZACODES/access-main` main at `47fb196236824d2541c97f3efe0e67eacf86dc7a`.

Topic: dialog focus ownership, nested modal lifecycle, disclosure keyboard behavior, roving tab stops, skip-link handoff and focus restoration. This is distinct from the previous responsive-reflow round.

## Included
- Focus model for visible/enabled/inert/aria-hidden controls and sequential keyboard order.
- Native and custom modal semantics, focus containment, Tab/Shift+Tab wrap, Escape, close and trigger restoration.
- Nested modal stack model with parent ownership and pending restoration.
- Disclosure and accordion expanded-state parity, keyboard activation and arrow-key movement.
- Roving tab stop, skip-link focus handoff and keyboard activation contracts.
- Playwright fixtures for native/custom dialogs, nested dialogs, English/French modal copy, accordion and tablist keyboard journeys, and axe scans.
- Root `package.json` based on current main, preserving all 60 current-main `test:scripts` tokens and adding the nine P20AG Node suites.

## Checks run
- Focused P20AG Node suites: 356 passed, 0 failed, 0 skipped.
- Strict isolated TypeScript check for every P20AG TypeScript source and Playwright spec: passed using a local declaration shim for the unavailable Playwright type packages.
- All nine P20AG Node test files exist and are registered in root `test:scripts`.
- All P20AG relative imports resolve to files included in this archive.
- Two Playwright spec files contain 28 statically declared test titles; no duplicate titles were found.
- Archive integrity, symlink and 50 MB per-file checks: passed.

## Not run / not claimed
- Full repository ESLint: not run locally; repository dependencies and full current-main checkout are not available in this working environment.
- Full workspace strict typecheck: not run; the isolated P20AG TypeScript check is not a substitute for all workspace tsconfigs.
- Full root `npm test` / `npm run test:scripts`: not run against the full repository.
- Playwright browser execution and axe scans: not run locally; the browser suite remains to be confirmed by repository CI.
- Production build and precache budget: not run. This round adds only E2E source/tests and root test-script registration; no production app files, bundles or assets are changed. The budget was not independently measured.

No product runtime UI, storage, network, service worker, cron, scheduled workflow or keep-awake behavior was added. No real-place accessibility facts are asserted.
