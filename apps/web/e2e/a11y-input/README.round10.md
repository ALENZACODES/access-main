# P16 round 10 — focus surfaces, names, feedback and reflow

This set of Playwright modules is kept under `apps/web/e2e/a11y-input/`.
`live-round10.spec.ts` imports all four auditors and runs against the route
list from `route-catalog-round10.ts` on current `main`. The four fixture specs
are also discovered directly by `apps/web/playwright.config.ts` (`testDir` is
`./e2e`). They are not unused source files.

## Scope

- `focus-surface-round10.ts`: read-only census of sequential targets and
  their minimum sizes, plus a computed-style probe of the currently focused
  element. The probe identifies hidden, disabled, off-screen or obscured focus,
  absent focus indicators, and clipped focus targets.
- `name-relations-round10.ts`: authored accessible-name and label linkage
  checks. It checks ID references, native labels, visible text in names,
  fieldsets, groups, form descriptions and error messages. It does not claim
  to reproduce an assistive technology's speech output.
- `feedback-round10.ts`: live-region, output, status, progress, meter,
  aria-current and invalid-input error semantics. The optional status-event
  runner only activates controls carrying `data-a11y-safe-status-target`.
- `reflow-interaction-round10.ts`: read-only 320px reflow diagnostics,
  action target size, separately labelled keyboard scrollers, and alternate
  controls for drag, multipoint, and motion input.

## Failure policy

The fixture specifications include deliberately incorrect DOM to assert that
corresponding failures are detected. A missing finding is a failed test.
The live-route suite checks shared keyboard, status and gesture contracts on
all available routes; it does not replace the existing broader axe checks.
No audit changes preferences, accessibility records or app data. Only the
explicitly safe test-fixture announcement runner activates a control.

EN and FR use the same semantic contracts. Language-dependent text is not
matched against an English sentence, except for the known French switch
control used by the existing application shell.

Unknown accessibility remains UNKNOWN. A missing source, licence or date is
not filled or inferred by any of these checks. This lane contains no location
or accessibility dataset, credentials, tile service, scheduled operation or
external network request.

## Running

```sh
npm run test:e2e -w @access/web -- --project=chromium e2e/a11y-input
```

For a local focused run, use `A11Y_ROUTES=/,/settings` with the above command.
CI should leave the route override unset. Browser execution and manual
keyboard/switch/screen-reader testing are both needed; these automated checks
alone cannot establish complete WCAG 2.2 AA conformance.
