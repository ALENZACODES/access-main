# P16 Round 14 — interaction alternatives and semantic lifecycle

This round is scoped to `apps/web/e2e/a11y-input/`. Playwright discovers each
`*.spec.ts` file through the existing `apps/web/playwright.config.ts`; no
configuration change or test exclusion is required.

## New audit modules

- `semantic-surface-round14.ts`: landmarks, heading hierarchy, control names,
  state tokens, duplicate IDs, and ARIA reference integrity.
- `focus-lifecycle-round14.ts`: actual Tab order, reverse adjacency, target
  geometry, disabled/inert exclusions, focus indicators, and marker cleanup.
- `form-feedback-round14.ts`: native and ARIA labels, required state, invalid
  state, described errors, and error-summary link integrity.
- `dialog-focus-round14.ts`: modal state, accessible names, opener references,
  focus containment, Escape closure, and focus restoration.
- `gesture-alternatives-round14.ts`: keyboard alternatives, target geometry,
  custom slider state, orientation, and arrow-key response.
- `announcement-round14.ts`: status and alert priority, hidden live regions,
  valid relevance, and text update observation.
- `locale-contract-round14.ts`: document language and French typography.
- `route-stability-round14.ts`: route state, focus-without-navigation, and
  skip-link target references.

## Test suites

Each module has positive and negative browser fixtures. `route-stability-round14`
also runs against the current route catalog from the existing `helpers.ts`.

The tests observe browser behaviour and DOM semantics; they do not claim to
emulate a screen reader or certify a person's access experience. Unknown data
is not inferred. The round uses no external data or third-party services.

## Additional regression matrices

- Focus edge matrix: native control types, disclosure content, programmatic
  focus, contenteditable, hidden/inert exclusions, DOM removal, and bounded
  traversal cleanup.
- ARIA state matrix: checked, pressed, current, expanded, disabled, owns,
  controls, and labelled/described-by relationships.
- Keyboard activation matrix: Enter, Space, arrow keys, Home/End, and native
  select type-ahead.
- Form transition matrix: required/invalid/readonly/disabled state and
  multi-reference error descriptions.
- Dialog cycle matrix: initial focus, background exclusion, Escape closure,
  and focus restoration.
- Locale round-trip matrix: live application language changes driven by
  keyboard activation, with document language and French punctuation checks.
