# Round 11: keyboard input continuity

This round adds source modules and Playwright specs under `e2e/a11y-input/`.
The web project's existing Playwright configuration discovers `*.spec.ts`,
so no extra runner or CI configuration is needed. The live spec reads the
current router, Settings table and More route table, rather than inventing
routes or relying on unmerged branches.

## Run locally

```sh
npm run test:e2e -w @access/web -- e2e/a11y-input/live-round11.spec.ts
npm run test:e2e -w @access/web -- e2e/a11y-input/route-continuity-round11.spec.ts
npm run test:e2e -w @access/web -- e2e/a11y-input/disclosure-contract-round11.spec.ts
npm run test:e2e -w @access/web -- e2e/a11y-input/data-view-round11.spec.ts
npm run test:e2e -w @access/web -- e2e/a11y-input/keyboard-guidance-round11.spec.ts
npm run test:e2e -w @access/web -- e2e/a11y-input/focus-handoff-round11.spec.ts
```

`A11Y_ROUTES=/,/help` narrows a local live run. CI should leave the override
unset so new non-parameter routes receive coverage automatically.

## What fails

- Placeholder or unnamed links, missing skip targets, incorrect current-page
  declarations and unsafe external-new-window targets.
- Disclosure controls whose expanded state does not match their visible
  panel, keyboard-inaccessible triggers and nameless dialogs.
- Table header and sorting errors, grid/listbox selection errors and
  inaccessible range controls.
- Shortcut conflicts, missing accessible instructions, descriptions that
  cannot be resolved, and gestures without a reachable alternative.
- Focus that disappears, is obscured or moves after non-navigation preload,
  and round-trip keyboard traversal that cannot reach its preceding control.

The fixture suites contain deliberately broken and passing markup. These
checks are neither a substitute for physical switch testing nor a complete
WCAG 2.2 AA determination. Every report is an observation of the rendered
browser DOM, not an inference about a location's accessibility. Missing
location facts remain UNKNOWN. The suite creates no external data source,
requires no tile service, and makes no scheduled request.
