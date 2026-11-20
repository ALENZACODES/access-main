# P20AK — offline accessibility continuity and evidence audit

This round adds a read-only Playwright/Node audit for observed route, keyboard,
offline cache, service-worker, evidence provenance and EN/FR status transitions.
It does not make claims about physical locations, eligibility or service providers.
Missing measurements remain `UNKNOWN`.

All new APIs are exposed by `p20ak-index.ts`, without modifying previously merged
barrels. The Playwright runner discovers `p20ak-live.spec.ts` automatically. The
root `test:scripts` command retains its original entries and registers six new
Node suites. The live route matrix comes from `appRoutes()`; it does not pin a
static route count. The live browser sweep is bounded to the root route in two
languages and both WCAG reflow widths because the existing axe sweep covers
all routes.

No root PR-BODY.md, background workflow, cron, secrets, synthetic places or
lockfile is included. Any previously tracked root PR-BODY.md should be removed
separately from Git rather than replaced from this package.

Tests: `node --experimental-strip-types --test apps/web/e2e/axe-sweep/p20ak-*.node.mjs`.
The full application lint, browser e2e and production precache checks must be
run in a complete checkout with installed dependencies before merging.
