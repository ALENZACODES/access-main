# P16 CI repair on current main

Replace files at their exact repository paths. The navigation audit checks each
adjacent Tab/Shift+Tab transition before moving forward, so browser focus
wrapping cannot create a false reverse traversal. A changed reverse transition
still fails the assertion. The labelled check/radio hit area audit from main
is kept intact.

`fixtures-round5.spec.ts` intentionally includes a **negative fixture** named
`negative fixture: unnamed download link`. Its expected result is an
`unnamed-download` issue; the fixture is not application copy.

The main web entry imports `target-minimums.css` after `global.css`, retaining
44 CSS pixel minimums for standalone controls and avoiding intrusive changes
for inline prose links. The round-five announcement audit tests focus with
`element === document.activeElement`, not an unsupported Locator method.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e`
from a full checkout with dependencies and Playwright Chromium installed.
