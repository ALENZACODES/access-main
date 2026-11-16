# EN/FR axe route sweep

`axe-sweep.spec.ts` is a Playwright-discovered test. It starts at the site
root and common English/French URL variants, follows same-origin HTML links,
and runs axe with WCAG 2.0/2.1 A/AA and 2.2 AA rule tags on each reachable
page. It asserts that both `html[lang="en"]` and `html[lang="fr"]` are seen.
Failures include the route, axe rule, and up to five affected targets.

**Run:** From the web workspace, run its existing Playwright test command
with `apps/web/e2e/axe-sweep/axe-sweep.spec.ts` as the test path (adjust the
path relative to the Playwright config's `testDir`). Set Playwright's
`use.baseURL` to the running local App, and ensure `@playwright/test` and
`@axe-core/playwright` are installed in that workspace. Optionally set
`AXE_SWEEP_EN_URL` and `AXE_SWEEP_FR_URL` to the real locale entry points;
relative URLs are resolved against `use.baseURL`.

The scan follows public links, not authenticated, hidden, or action-only
routes. It does not infer accessibility from missing information and is not
a substitute for keyboard, switch, or assistive-technology testing. If the
site has more than 60 discovered URLs, the test fails rather than silently
claiming full coverage. No external tile server is requested by the test.
