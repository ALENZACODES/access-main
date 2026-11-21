# Round eight: keyboard, dialogs, forms and route evidence

This package extends the existing Playwright `a11y-input` suite. It is
independent of stacked branches and uses only existing Playwright and test
helpers on the current main branch. `live-round8.spec.ts` is discovered
by `apps/web/playwright.config.ts`; it imports all five audit modules.

## What it checks

- Bounded Tab scanning for keyboard and switch-style sequential focus;
  out-of-order tabindex, hidden subtree focusability and disabled targets.
- Focus visibility and keyboard-only control activation in purpose-built
  fixtures. Live routes are read without activating arbitrary action buttons.
- Dialog name/description references, declared opening controls, modal focus
  containment, Escape dismissal and restoration of focus to the opener.
- Input labels, error-message references, stateful ARIA controls, fieldsets,
  single-selection groups, and opt-in error-announcement exercises.
- Route titles, one main landmark, first heading, navigation names, skip-link
  targets, unique IDs, image alternatives and language-control state.
- Evidence source, open licence, observation date and UNKNOWN preservation;
  explicitly marked EN/FR copy and offline-state assertions.

Every audit returns structured findings. Live-route specs assert empty results.
Negative fixtures deliberately violate contracts and assert the exact failure
code. New features do not alter application datasets, route state or secrets.

## Run

From the repository root with the web app dependencies installed:

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e -w @access/web
```

To narrow local browser tests to known routes:

```sh
A11Y_ROUTES=/,/profile,/map npm run test:e2e -w @access/web
```

The existing Playwright config builds and serves the application. The suite
is intentionally not a general claim of WCAG conformance or the results of
manual switch-device and screen-reader user testing. A person still needs to
check those input methods directly. Offline availability and accessibility
facts are not inferred: if evidence is missing, UNKNOWN remains UNKNOWN.
