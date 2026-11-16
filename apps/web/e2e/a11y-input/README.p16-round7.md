# P16 round 7: DOM ID relationship regression

This round is a fresh, independently importable Playwright source-and-test
addition intended for current `main` after the merges of #86 and #112. It does
not replace the previously merged DOM-ID regression, focus walk or performance
navigation preload. The test suite discovers files by the repository's
existing `apps/web/playwright.config.ts` configuration.

## Scope

The audit detects duplicated and empty IDs, absent ARIA references, repeated
IDREF tokens, invalid explicit label and table-header relationships, broken
local fragments, and invalid native form/datalist associations. It audits open
shadow roots independently and excludes inert `<template>` content. This
provides deterministic fixtures across both English and French copy without
asserting literal UI text or inventing accessibility information.

The fixture suite covers known-good semantic HTML and intentionally broken
relationships. Each negative fixture must produce the expected structured
finding; positive fixtures must produce none. This is additive to the existing
live route checks and does not relax or skip any existing test.

## Run

From the repo root with dependencies already installed:

```sh
npx playwright test --config apps/web/playwright.config.ts \
  apps/web/e2e/a11y-input/dom-relations-round7.spec.ts
```

Or from `apps/web`:

```sh
npx playwright test e2e/a11y-input/dom-relations-round7.spec.ts
```

Then run the existing quality gates:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:e2e -w @access/web
```

## Interpretation

A successful DOM relationship audit is **not** a declaration of WCAG 2.2 AA
conformance. The browser's accessible name computation has exceptions,
including deliberately hidden naming elements. The audit only flags explicit
`aria-hidden="true"` targets as suspicious, rather than treating every visually
hidden label as an error. Closed shadow roots are outside the browser DOM
inspection contract. Screen reader and switch-control sessions remain needed.

No runtime user information is persisted, no network request is made by the
audit helper, and no location-specific accessibility claims are generated.
