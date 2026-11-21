# P16 Round 9 — keyboard composites and DOM-ID regression

The Round 9 browser tests are present on the repository's default branch after
PR #149. This is a historical description, not a branch-pinning instruction.
Do not restore the source files from earlier ZIP archives: doing so could
replace newer mainline content. Begin future work at the live default-branch
head and retain the existing DOM-ID regression tests.

## Files already on main

- `keyboard-contract-round9.ts` — read-only browser-side audit and stable
  diagnostics for DOM identifiers, ARIA references and keyboard composites.
- `keyboard-contract-round9.spec.ts` — isolated fixtures for valid and invalid
  semantics, duplicate IDs, and open shadow-root ID scopes.

Neither file is included with this README correction. They already exist on
main and should be left intact.

## Local test commands

From a checkout with repository dependencies installed:

```sh
npm run lint
npm run typecheck
npm test
npx playwright test --config apps/web/playwright.config.ts \
  apps/web/e2e/a11y-input/keyboard-contract-round9.spec.ts --project=chromium
```

Playwright owns the `.spec.ts` browser fixtures. Vitest must not execute them.
The fixtures use `page.setContent` without calling outside resources or
changing application code. They check authored semantics rather than the
spoken output of an assistive-technology device.

## Scope and limits

The audit covers blank and repeated IDs, dangling references, active
descendants, roving tabindex, tab/panel associations, orphan composite
items, malformed ARIA states, positive tabindex, hidden focus targets and
nested interactive elements. An open shadow root has its own ID scope.
Closed shadow roots are not inspectable by the browser-side probe.

These findings are regression signals, not a complete accessibility
conformance assessment. Browser DOM inspection does not establish screen-reader
speech, physical-switch timing or all permissible composite behaviours.
Manual testing remains necessary.

The previous DOM-ID regression checks merged through PR #121 are separate and
remain part of the default branch. No unmerged PR is required to run this suite.
