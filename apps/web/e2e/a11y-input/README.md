# Keyboard, switch and screen-reader route checks

`route-input.spec.ts` runs in CI with the rest of the web Playwright suite
(`npm run test:e2e`). By default it checks **every live route**, read from
`src/router.tsx`, the Settings table in `src/features/routes.tsx` and, once it
is in the build, the More (J lane) table in `src/hub/routes.tsx`. A new route
is covered without editing the spec. Parameter routes (`/places/:id`,
`/help/:id`) and the catch-all are skipped.

Each route is opened in English and in French (switched with the header
language button, as a person would) at 320 and 1280 CSS pixels. Each run checks:

- document language, one `main` landmark, one non-empty `h1` and a page title;
- unique ids and image alternatives;
- an accessible name on every visible control, and the visible label inside
  that name (WCAG 2.5.3 label in name), read from Chrome's accessibility tree;
- 44 by 44 CSS pixel targets for buttons, fields and links (a link inside a
  sentence is exempt, as in WCAG 2.5.8);
- axe with the WCAG 2.2 AA rule set;
- the skip link as the first Tab stop, then Tab and Shift+Tab;
- Enter, then Space, activating the first enabled button in `main`.

`A11Y_ROUTES=/map,/more` narrows a local run to the listed paths. CI leaves
it unset, so CI covers every route.

Automated checks find some failures. They do not prove WCAG 2.2 AA, real
assistive-technology announcements or physical switch timing. Manual
screen-reader, switch and keyboard testing still follows.

These tests contain no accessibility-location dataset. Missing accessibility
facts must remain UNKNOWN rather than inferred.
