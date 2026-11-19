# P19 R30 — Offline release acceptance ledger

Baseline observed on 2026-11-19: access-main `588dbca798c9876342cbfa74d4fc50ca788558c9`, access-help `4ebf580b597dd9aaed55fc9ab6213516fac518a8`, access-maps `556cec3ffad363c8204ff69fe4c571bea1edb170`, access-tools `6f35cecd184fc6e87b44930e2bb67ae7b1574f44`.

## Scope

New `offline-acceptance-*` modules are an offline, conservative record of technical release-check observations. They do not certify WCAG compliance, accessibility of any place, or a user's entitlement. All recorded test states are PASS, FAIL or UNKNOWN. A missing required test stays missing; a user-supplied unknown stays UNKNOWN. No network access, timers, scheduled workflows, secrets, or personal data.

- `offline-acceptance-ledger.mjs`: validated release check ledger, canonicalization, strict provenance, SHA-256 fingerprint and bounded JSON import/export.
- `offline-acceptance-coverage.mjs`: explicit per-route/global coverage, fail-closed missing checks and optional joined review queue from current main.
- `offline-acceptance-delta.mjs`: deterministic before/after comparison with explicit UNKNOWN transitions and base fingerprint guard.
- `offline-acceptance-report.mjs`: bilingual accessible HTML, CSV, text, JSON, plus comparison reports and safe spreadsheet output.
- `offline-acceptance-fixtures.mjs` and four module test suites: synthetic fixtures and offline regression tests.
- `offline-acceptance-policy.test.mjs`: uses the existing `forbiddenOrgNeedles()` helper in `packages/shared/test/forbiddenOrg.ts`.

## Existing PR repair

`offline-release-contract.test.mjs` is a complete replacement of the corresponding file in PR #221 (branch `chatgpt/p19-r29`, commit `7cec36037704adfe3390ca232b8af9f4085aba48`). Removes unused `unknownKeys` and `releaseIssues` imports, the exact two lint errors in workflow run `44623830076`. `offline-release-contract.mjs` is included complete because the test directly imports this PR file, which is not yet on main. The existing `site-audit.mjs` remains on main and is intentionally not duplicated.

## Test notes

Isolated run: `node --test --experimental-strip-types scripts/release/offline-acceptance-*.test.mjs scripts/release/offline-release-contract.test.mjs`: 272 passed, 0 failed. For the prior PR test, a local test-only implementation of the `site-audit.mjs` licence/date helpers matching current main behaviour was used because the full checkout is unavailable. This local fixture is **not** included in the ZIP. New feature tests ran against a byte-identical copy of main's `offline-review-queue.mjs`; it is also **not** included in the ZIP.

Node syntax checks passed for every included `.mjs`. No literal U+00A0 or U+202F occurs in added source; code escapes produce correct French U+00A0 before colon and U+202F before ; ! ? and inside guillemets. Only the token UNKNOWN is used for missing claim state.

Full root `npm run lint`, repository typecheck, browser axe tests and CI are **not verified**: complete checkout and installed dependencies are absent. No GitHub refs or PRs were modified. Apply the two existing-PR repair files to PR #221; apply the `offline-acceptance-*` files to a new branch from the checked main head. Do not merge the PR fix into current main as a new change when that PR is still open.
