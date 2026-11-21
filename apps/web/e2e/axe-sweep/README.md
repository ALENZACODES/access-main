# Accessibility sweeps

Playwright specs in this folder run with the rest of `npm run test:e2e`.

## Live sweeps (open the built app)

- `axe-sweep.spec.ts`: axe on every route, in English and French, at 320 and 1280 CSS px.
- `p20g-live.spec.ts`: for every route, language and viewport, checks landmarks, control names
  and 44 px targets, form fields, live regions, links, dialogs, media and tables, then runs axe.
  It also walks keyboard focus forward and back, runs a search, and switches language with the
  header button. Language is chosen with the real button, never by URL.
  Two tests are marked `fixme`: following a place link and a help article link. On a fresh
  visit `/places` lists nothing until a region pack is saved and `/help` lists articles only
  after a search, so those tests need that set-up first.
- `p20g-offline.spec.ts`, `p20g-browser.spec.ts`: offline and browser-helper checks.

## Policy checks (no app needed)

`*-contracts.spec.ts`, `p20e-policy.spec.ts`, `p20e-contrast.spec.ts`, `p20e-journeys.spec.ts`,
`p20f-resilience.spec.ts` and `sweep-contracts.spec.ts` test the rule functions in the matching
`.ts` modules with hand-made snapshots: what counts as a finding and what does not.

## Rules worth knowing

- A control is named by `aria-label`, `aria-labelledby`, its `<label>` (input, select and
  textarea), `title`, or its text.
- `tel:` and `mailto:` links are allowed; script and data schemes are findings.
- A route whose main region has nothing that can take focus is not a keyboard failure.
  A route with focusable controls that the Tab walk never reaches is.
