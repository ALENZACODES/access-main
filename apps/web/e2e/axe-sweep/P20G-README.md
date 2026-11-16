# P20G — live route and interaction gates

P20G extends the existing P20 through P20F browser checks with fail-closed
policies for rendered controls, field relationships, language transitions,
navigation, search, dialogs, source metadata and offline document state.

- `p20g-contracts.ts` contains the deterministic audit rules.
- `p20g-browser.ts` reads real browser geometry and behaviour.
- `p20g-live.spec.ts` exercises all `appRoutes()` paths in EN/FR and at 320px
  and 1280px, uses the existing Day 17 `chooseLanguage()` helper, runs axe,
  and requires a real linked identifier on place and help detail screens.
- `p20g-offline.spec.ts` tests offline document reload rather than claiming
  that a service worker or data pack exists when one is absent.
- `p20g-contracts.spec.ts` and `p20g-browser.spec.ts` contain negative cases
  that demonstrate the checks failing on violations.

The existing web Playwright runner discovers each `.spec.ts` file beneath
`apps/web/e2e`. No separate CI job, crawler or generated route list is needed.

An inline link is a real target and is always measured against the project's
44 by 44 CSS pixel rule. Finder radios and checkboxes use an interactive
wrapping label's bounding rectangle when one exists, not a decorative parent.
An absent place or help detail link is an explicit failure; a sample ID is
never fabricated. Missing accessibility facts remain `UNKNOWN`.

Run with the normal web e2e command after building and serving the app. A
passing automated suite is not a substitute for testing with assistive
technology and human participants.
