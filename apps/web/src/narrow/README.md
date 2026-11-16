# narrow

Helpers to audit a page at 320px wide for sideways overflow (reflow) and for
interactive targets under 44px.

- `auditTargets`, `auditReflow`, `auditBoxes`: pure, work on measured boxes.
- `measureInPage`, `auditRoutes`: read layout through a Playwright-style page
  and audit a list of routes at 320px. Layout is only read, never changed.
- `describeFinding`, `formatReport`: EN and FR messages.

Limits: a box inside its own scroll container (a wide data table, say) is still
reported, so review those by hand. Hidden or unmeasured boxes are skipped, which
means they are not checked, not passed. Passing this audit is not a conformance
claim.

Run with the web package's test runner (`*.test.ts`).
