# P20E — stateful EN/FR accessibility journey gates

This increment extends P20, P20C and P20D. It is located entirely in
`apps/web/e2e/axe-sweep/`; it does not modify unrelated application files.
The `p20e-live.spec.ts` and `p20e-*.spec.ts` files are discovered by the
same Playwright test runner as the prior lane. The live spec imports the
new browser adapter, journey checks and policy contracts. No helper is
shipped without a test or an integration entrypoint.

## Coverage

- Crawl live local routes in EN and FR; inspect actual browser-rendered
  controls, metadata, headings, forms, media and status records.
- Enforce a minimum 44×44px interactive target and catch significant
  overlapping controls as well as keyboard-inaccessible custom controls.
- Reject missing labels, unannounced invalid input, missing captions,
  missing media text, and disabled status announcements.
- Detect absent document titles, main landmarks, first-level headings,
  suspicious heading order, zoom restrictions and horizontal overflow.
- Detect remote map-tile requests without contacting or relying on any
  third-party tile provider.
- Preserve UNKNOWN when observation data is missing, expired, future dated,
  incorrectly licensed or missing source attribution.
- Detect unsupported changes to observation state across navigation.
- Exercise Tab focus progression and modal focus semantics.
- Exercise local navigation, browser history and an offline reload in both
  languages. Missing offline control fails the audit.
- Run axe WCAG 2.2 AA tags at 320px with reduced motion.
- Unit-like Playwright specs contain positive and negative cases for every
  exported pure policy, including locale, date and offline transitions.

## Running

Run the repository's e2e command with Playwright configured to discover
`apps/web/e2e/axe-sweep/**/*.spec.ts`; set `use.baseURL` to the local web
server. P20D locale-entry overrides remain supported:
`AXE_SWEEP_EN_URL` and `AXE_SWEEP_FR_URL`.

The suite reports problems as rule, page, target and explanation and uses
Playwright assertions to fail on violations. It does not alter stored
content, submit forms, request access to accounts, or make decisions for
individuals. Observed accessibility information is not inferred from
missing fields or navigation success.

The rendered evidence contract uses the existing `data-accessibility-status`,
`data-source`, `data-licence`, `data-observed-at`, `data-expires-at`, and
`data-collected-at` attributes. A positive or blocked observation must have
an identifiable source, permitted open licence and a valid calendar date.
Dates and records in deterministic specs are synthetic test fixtures.

## Limits

These are browser checks, not a claim of conformance. Actual assistive
technology use, route creation behind private authentication, and physical
site assessment remain separate activities. Running the browser spec requires
the configured local App, the existing Playwright dependencies and a working
service worker for the offline scenario.
