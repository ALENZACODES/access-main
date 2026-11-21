# P16 Round 31: keyboard, switch and screen-reader pathways

This is an additive fixture-driven accessibility regression package. It does not
change application navigation, user data, storage, or production routes.
The DOM-ID regressions from earlier rounds stay on the mainline and are not
replaced. No automated DOM test can establish what a screen reader speaks or
how a person's physical switch device behaves. Manual sessions remain necessary.

## Components

- `contracts.mjs`: semantic DOM snapshots, ID references and evidence attribution.
- `focus.mjs`: sequential traversal, reverse order, target geometry, switch
  alternatives, ARIA composite states and modal lifecycle observations.
- `announcements.mjs`: live regions, updates, errors, language changes, progress,
  and offline-state announcements.
- `browser.ts`: read-only Playwright page probes for semantic nodes, focus,
  live regions, composite controls and switch alternatives.
- `*.node.mjs`: isolated pure audit regressions, including intentionally broken
  and valid observations. Node's native test runner owns these files.
- `*.spec.ts`: independent Chromium fixture tests using the existing app
  Playwright configuration. Browser tests never navigate to external websites.

## Run the added suites

From the repository root after installing project dependencies:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:scripts
npm exec -w @access/web -- playwright install chromium
npm exec -w @access/web -- playwright test --config apps/web/playwright.config.ts apps/web/e2e/a11y-input/round31 --project=chromium
```

The `package.json` in this package is the complete mainline file with only
`test:scripts` extended to include the three `round31/*.node.mjs` suites. The
existing R10, R16, R17, R19, R20, R21, R23, R24 and R27 hooks remain.
The browser suite is discovered independently by Playwright; it is not run by
Node's test runner or Vitest. No scheduled workflow or new package is required.

## Scope

The browser helper enumerates visible and hidden DOM elements to assess
landmarks, accessible names, ARIA references, ID collisions, role states and
open shadow roots. References remain scoped to their own tree. A node with an
unknown evidence tier retains the state `UNKNOWN` and cannot be promoted to a
supported record by any audit or export.

The keyboard helper tests normal and reverse Tab order, active focus geometry,
roving tabindex, active-descendant ownership, arrow-key transitions, native
Enter and Space semantics, and modal Escape/focus restoration. Focus checks
stop at a bounded number of steps, without activating unrelated controls.
Switch audits look for ordinary keyboard alternatives to drag, motion, and
multi-pointer operations. These contracts are proxies for accessible input
paths, not a simulated physical switch scan.

The live-region helper detects a silent status, hidden announcement, incorrectly
marked urgent event, missing progress name, unchanged update, mismatched
document language, and missing form-error links. It checks whether authored
semantics can support assistive technology, not the output of a speech engine.

## Language and attribution rules

Records carry language, stable ID, translation key, explicit state and tier,
source name, HTTPS attribution URL, licence, collection date, and offline
presence and capture date. Missing source metadata is an error. A missing or
uncertain state stays `UNKNOWN` rather than adopting a plausible value.

English and French are supported. French punctuation uses a curly apostrophe,
U+00A0 before a colon, and U+202F before semicolons, exclamation marks and
question marks, and immediately inside guillemets. Source files represent
no-break spaces as Unicode escapes rather than literal irregular whitespace.

## Limitations and integration

The fixture suite does not assert full accessibility conformance. Relevant
manual checks include actual screen-reader/browser combinations, physical
switch timing, bilingual pronunciation and keyboard interactions with dynamic
map and offline components. Run the full monorepo test suite and browser
suite in a dependency-installed current-main checkout before merging.
