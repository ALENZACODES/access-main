# P20AA journey continuity and keyboard contract round

This package adds 2,000+ substantive lines of source and regression tests under
`apps/web/e2e/axe-sweep`. It does not create a root `PR-BODY.md`.

`p20aa-journey-model.ts` checks cross-action route, locale, focus, history,
announcement, and evidence continuity. `p20aa-keyboard-policy.ts` checks
roving tabs, linear tab order, dialog focus restoration, and touch target
geometry. `p20aa-language-contract.ts` contains unbranded EN/FR status strings,
French typography validation, and missing-data handling. The browser observer
reads the DOM without writing to application data or supplying made-up place facts.

`p20aa-live.spec.ts` gets its live inventory directly from `appRoutes()` and
runs a small English/French by mobile/desktop smoke matrix. Existing exhaustive
axe suites remain responsible for the full route matrix. The helper file in
`../a11y-input/helpers.ts` is an unchanged main copy included so the archive
contains every repo-local file referenced by the new live test.

Standalone checks:

- `node --experimental-strip-types --test apps/web/e2e/axe-sweep/p20aa-contracts.node.mjs`
- `npm run lint`
- `npm run typecheck`
- `npm run test:e2e`

The standalone regression suite contains 303 individually named test cases.
The other three commands require a checkout of the current repository and its
installed dependencies; they were not executed in the artifact workspace.
