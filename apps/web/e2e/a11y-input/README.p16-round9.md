# P16 Round 9: keyboard composite and DOM-ID regression gates

This standalone package was originally authored against an earlier `main`.
Its keyboard contract tests were merged through PR #149 and are already on
`main`. At the time of this documentation correction, the current `main`
commit is `f7dac4d62d21ed81cded8ddafaf23de85e92b1ca`.

No unmerged branch or PR is a prerequisite for the Round 9 tests. This
README correction updates the historical base reference; it does not modify,
re-land, or change either of the merged Round 9 TypeScript files.

## Existing files on main

- `keyboard-contract-round9.ts` — read-only browser-side audit and stable
  diagnostic output for DOM IDs, ARIA references, and keyboard composites.
- `keyboard-contract-round9.spec.ts` — isolated DOM fixtures for valid and
  intentionally invalid semantics, including duplicate IDs and open shadow roots.

## Local checks

Run from the repository root with its dependencies installed:

```sh
npm run lint
npm run typecheck
npm run test
npx playwright test --config apps/web/playwright.config.ts \
  apps/web/e2e/a11y-input/keyboard-contract-round9.spec.ts --project=chromium
```

Do not pass this Playwright file to the Vitest runner. The fixtures use
`page.setContent` and do not navigate to app routes, access outside resources,
write storage, or change production source.

## Scope

The audit examines duplicate and blank IDs, dangling or ambiguous ID
references, active descendants, roving tab stops, tab/panel associations,
orphan role items, malformed ARIA state values, positive tabindex, inert
or hidden focusable controls, and nested interactive content. It supports
roving tabindex and active-descendant models. Open shadow roots are inspected
independently. Closed shadow roots are not observable using this test method.

The audit is a regression signal, not a full accessibility conformance
assessment. Browser DOM checks cannot establish screen-reader speech,
switch timing, or every permissible composite implementation. New diagnostic
rules require review against real application patterns before they become
hard gates on all routes.

## Integration

PR #121 and its DOM-ID regression files also remain on `main`. The tests from
both rounds are separate. This documentation update is the sole Round 9 file
included in the next P16 archive; the two merged TypeScript files are omitted
on purpose to prevent stale content from replacing current code.
