# P16 round 5 — keyboard and information access

This patch extends the same Playwright test folder. `round5-live.spec.ts`
imports every audit helper and executes it on each configured application route.
`fixtures-round5.spec.ts` contains positive and deliberately broken HTML cases.
Failures in the broken cases prove that the audit detects violations instead of
quietly returning success. No new production route or CI file is invented.

Run from the repository root with the existing Playwright configuration:

```sh
A11Y_ROUTES=/,/en,/fr npx playwright test apps/web/e2e/a11y-input
```

`A11Y_ROUTES` must list actual existing routes. The default is `/`. The suite
loads pages over HTTP and fails on missing routes. Optional active controls
are exercised only when they explicitly opt in using the following contracts:

- `data-a11y-test-submit="safe"`: harmless local form validation only.
- `data-a11y-reversible="true"`: a disclosure that can be opened and closed.
- `data-a11y-announcement-trigger="id"`: local update to an announcement region.
- `data-a11y-route-test="safe"`: local-origin route transition.
- `data-a11y-toggle-test="reversible"`: reversible Space-key toggle.

The static audits are not opt-in: all visible forms, tabsets, menus, treeviews,
listboxes, tables, navigation links, live regions, and ARIA composites are
inspected. The App may offer zero optional widgets; any widget it does offer
must meet the semantics tested here. Custom map views can use
`data-a11y-map` with `data-a11y-list-alternative="id"` to require a visible
semantic list or table. Gesture-only interactions can declare a normal input
alternative through `data-a11y-drag-alternative`,
`data-a11y-motion-alternative`, or `data-a11y-single-pointer`.

Optional offline coverage requires paths that the service worker caches:

```sh
A11Y_RESILIENCE_ROUTES=/en,/fr \
A11Y_ROUTES=/en,/fr \
npx playwright test apps/web/e2e/a11y-input/round5-live.spec.ts
```

Offline checks turn network access off, reload the named route, inspect the
landmarks and keyboard access, then restore network access in a `finally`
block. A cached document is required on those explicitly named routes.
English and French copy is assessed through the prior language suites; this
round adds shared semantics for both languages without prescribing translated
text. Accessibility records retain their source, open licence, collection
date, and UNKNOWN state. No data is created, imported, or inferred by the suite.

The focus path audit walks actual Tab stops, checks viewport visibility and
occlusion, and tests reverse navigation. Screens with a designed cyclic
keyboard interaction should be manually assessed as well. These tests are
regression gates, not a substitute for assistive-technology sessions with
physical switches and screen readers or full WCAG 2.2 AA review.

## Failure policy

The live tests assert an empty list of diagnostic findings. They do not mark
issues as warnings or automatically exclude inaccessible controls. A route
with a missing main landmark, a malformed ARIA value, or a broken keyboard
interaction causes a failed Playwright assertion. The test framework retains
screenshots and traces according to the repository's existing configuration.

The fixture suite makes intentional defects within isolated documents:
invalid error references, missing names, conflicting tab selection,
empty table headings, inaccessible map alternatives, missing UNKNOWN
metadata, inert focus contexts, and unsupported pointer-only controls.
Each case asserts its exact diagnostic code. Positive fixtures assert that
semantically sound controls return no findings. For active interactions,
fixtures exercise native Enter and Space keyboard events and inspect state
changes without generating artificial accessibility data or sending network
requests.

## Limitations

A screen reader's spoken output and a hardware switch's scanning behaviour
cannot be established by DOM assertions alone. The suite checks semantic
structure and keyboard input pathways that those technologies use. Manual
sessions should cover dynamic announcements, real-world switch timing,
assistive-technology browser combinations, and localized reading order.
Routes with authentication must be prepared by the repository's existing
test fixtures; this lane does not create credentials or modify login logic.
