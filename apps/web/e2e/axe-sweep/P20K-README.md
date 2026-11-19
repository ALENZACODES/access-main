# P20K semantic integrity regression

The Playwright-discovered `semantic-integrity-live.spec.ts` complements the
existing route-wide axe audit. It tests the main navigation and search
surfaces in English and French at 320px and 1280px. The route inventory
comes from `appRoutes()`, with uniqueness and required-path assertions
rather than a hardcoded total.

`semantic-integrity.ts` is a pure, independently testable set of contracts.
`semantic-integrity-browser.ts` reads the rendered document without changing
user state. The browser fixture suite exercises the DOM extraction with known
pass/fail cases. Tests report failures with the route, rule and element.

The checks cover duplicate DOM IDs, missing/ambiguous IDREF destinations,
visible hash-link destinations, document and fragment languages, named
keyboard controls, main/first-heading structure, document titles, and 320px
horizontal overflow. The audit does not infer accessibility of a place or
change an UNKNOWN state to a positive finding.

The existing axe and target-size sweeps remain the authority for WCAG rule
coverage and 44px hit targets. Automated checks are not a substitute for
manual keyboard and assistive-technology testing.

Run from the web workspace with the standard Playwright E2E command. The
current runner already discovers `e2e/**/*.spec.ts`; no new CI workflow,
network service, licence, dataset, or scheduled task is required.
