# P20Y: navigation and state-continuity contracts

Base: access-main `e00cfce707fdb1d504da805fbaab476176c1e684`.

## Apply

Copy the complete paths from this ZIP into a checkout based on the stated main commit. The route-coverage file is a correction for open #202, not a replacement for unrelated code on main. Its exported API is unchanged and its control-character check uses a character-code loop rather than a regular-expression character range.

## New contracts

- `p20y-navigation.ts`: internal versus external destinations, accessible link names, heading and landmark uniqueness, skip-link focus, keyboard focus order, transition identity and route/locale/viewport coverage.
- `p20y-disclosure.ts`: state-role compatibility, dialog and disclosure states, roving tab index, active descendant references, composite selection, keyboard arrow/home/end transitions and focus.
- `p20y-state-history.ts`: evidence completeness, source/licence/date/tier continuity, UNKNOWN retention, locale and offline transitions, status announcements, retry/clear behaviour and coverage matrices.
- The four `.spec.ts` files exercise these contracts using Playwright-compatible `for...of` declarations and fixtures. No app data, package manifests or lockfiles are modified.

The contracts are read-only and do not infer any positive real-world access condition from missing records. No URL is fetched and no schedule or workflow is added. The language checks in the package do not generate user-facing text.

## Tests

These new contract specs can be executed with the repository's existing Playwright runner. Strict TypeScript checking and 240 focused assertions passed using a temporary local Playwright test shim. This local environment lacks ESLint, the full workspace dependencies and an installed browser, so repository-wide lint, typecheck and live E2E remain pending. Do not report the full CI job as green until it actually completes.
