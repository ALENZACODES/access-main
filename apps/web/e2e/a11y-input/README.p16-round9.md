# P16 Round 9: keyboard composite and DOM-ID regression gates

This standalone package is authored against `ALENZACODES/access-main` `main`
(`4d15a82281a381c077b348676dede770d002a049`). It is not a stack on
P16 PR #121 or another unmerged branch. All imports are provided by the
existing `@playwright/test` package or by this package's own source file.

## Files

- `keyboard-contract-round9.ts` — read-only in-browser audit and deterministic
  diagnostic output for ID, IDREF, ARIA and keyboard composite structures.
- `keyboard-contract-round9.spec.ts` — independently created DOM fixtures for
  correct and deliberately invalid semantics, including a dynamic duplicate-ID
  regression and open-shadow-root ID-scoping regression.

## Verify

Run from repository root, with the repository's dependencies installed:

```sh
npm run lint
npm run typecheck
npm run test
npx playwright test --config apps/web/playwright.config.ts \
  apps/web/e2e/a11y-input/keyboard-contract-round9.spec.ts --project=chromium
```

Do not pass this test file through Vitest: it is a Playwright test and should
be discovered only by the existing Playwright configuration. The browser
fixtures use `page.setContent` and do not navigate to application routes,
open external resources, write storage, or alter application source.

## Scope and supported contracts

The audit checks for per-tree duplicate and whitespace-only IDs, missing or
ambiguous ID references, invalid active descendants, roving tab stops,
valid tab/panel associations, orphan role items, invalid ARIA state values,
positive tabindex, inert/aria-hidden focusable controls, and nested interactive
content. The contract recognises both roving-tabindex and active-descendant
styles. Shadow roots are inspected independently; closed shadow roots are not
observable. Every diagnostic records a stable element path and the affected
attribute. No fixture text assumes a particular interface language.

These checks are regression signals rather than a WCAG conformance claim.
They do not verify keyboard event handlers, timing and announcements with a
screen reader, switch device operation, or all authoring-practice variations.
Do not automatically apply every possible diagnostic as a fail gate to a
production route without first reviewing legitimate UI patterns.

## Integration notes

PR #121 is merged into `main`, and its previous DOM-ID regression tests
remain unchanged. Its two reported GitHub `test` checks succeeded. This round
has its own independent duplicate-ID fixture so that the regression remains
covered if the new tests are run alone. No unmerged branch or PR dependency is required.

The standalone strict TypeScript check was run with a minimal local
Playwright declaration because the working container could not fetch npm
packages. That check is not equivalent to the repository's full lint, build,
typecheck, Playwright run or GitHub CI. Those must still be executed in the
proper dependency-installed environment before the patch can be called green.
