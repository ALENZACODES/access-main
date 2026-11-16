# P20I — rendered accessibility contracts

This is the next independent accessibility-test round on current `main`.
The web Playwright configuration already discovers every `*.spec.ts` file
below `apps/web/e2e`, so the new suites are executable entry points.

## Modules

- `p20i-contracts.ts` defines pure EN/FR, 320/1280, 44px target, landmark,
  field, navigation, focus, media, table, disclosure, modal, live-region,
  form, provenance and route-matrix checks.
- `p20i-browser.ts` captures measured browser DOM state and keyboard identity,
  without inventing data or modifying production components.
- `p20i-journeys.ts` defines search completion, detail provenance, offline
  cache, browser history and language-continuity contracts.
- `p20i-contracts.spec.ts` exercises each individual rule with positive and
  negative synthetic fixtures.
- `p20i-browser.spec.ts` uses an actual Playwright page to prove that the
  collectors detect real DOM associations and target dimensions.
- `p20i-journeys.spec.ts` checks navigation and offline uncertainty contracts.
- `p20i-mutations.spec.ts` injects one fault at a time and asserts the exact
  diagnostic emitted, preventing silent rule loosening.
- `p20i-invariants.spec.ts` repeats critical invariants in every locale and
  viewport combination, including the 48px finder-control case.
- `p20i-live.spec.ts` uses `appRoutes()`, `chooseLanguage()` and `visit()` from
  Day 17 to inspect rendered routes; it does not crawl or invent locale URLs.

The imported shared organisation-name helper is the only source of banned-name
negative-test strings. No banned-name literals are authored in this lane.

## Expectations

There are no allowlists. Every live finding fails its spec. Inline links are
included in the project's 44px rule, and a small native radio is only credited
with a larger target when its containing label is interactive.

A visible sourced observation must retain its source, open licence and date.
An unknown value remains UNKNOWN; an empty detail view must be honest rather
than manufactured. A successful axe run does not replace manual assistive-
technology checks or establish full WCAG conformance.

Run from the repository's web workspace with its normal Playwright test
command. The full route run requires the production web-server fixture and
browser dependencies; pure specs can also be run by filtering `p20i-*`.
