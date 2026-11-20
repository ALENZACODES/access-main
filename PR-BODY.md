# P20 — #202 lint repair and P20AB interaction/evidence audit

Base: access-main `765ae920754c3bec7d5cf5bb2602110ccb1e549b`.
The branch for #202 contains pre-existing files that are absent from that main tree. Apply these complete files without restoring older merges or changing dependency manifests.

## Immediate CI corrections

- `apps/web/e2e/axe-sweep/p20w-route-coverage.ts`: replace control-character regex range with an explicit `charCodeAt(0)` loop; retain invalid-path failures.
- `apps/web/e2e/axe-sweep/p20x-announcements.spec.ts`: drop unused imported type `Stage`.
- `apps/web/e2e/axe-sweep/p20x-announcements.ts`: unchanged complete local import supplied for self-contained application.

## P20AB new work

- Read-only interaction transition policy: focus geometry, dialogs, forms, state announcements, EN/FR changes, offline/online changes and route matrices.
- Provenance continuity: source, licence, dated evidence, tier, UNKNOWN, unsafe links, bilingual identities, offline transitions and malformed evidence.
- French typography: curly apostrophes, U+00A0 before the colon, U+202F before semicolon/exclamation/question marks and inside guillemets. Explicit English spans stay exempt; unknown language stays UNKNOWN.
- New contract and cross-contract Playwright specs use ordinary `test(...)` declarations and `for...of` loops only.

## Local validation

- TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters`, `noEmit`: passed with a temporary declaration for the external Playwright API.
- 389 focused tests passed in a lightweight, synchronous Playwright-compatible assertion runner.
- Source checks: no unsupported `test.each`, no control-character regex in the patched route file.
- Full repository ESLint, integration typecheck, and browser E2E: not run in this environment; CI-green status is not established.

No scheduled workflows, lockfile changes, secrets, force-push, or branch mutation are included.
