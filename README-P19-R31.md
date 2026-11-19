# P19 R31 — Offline release incident register, review and exports

Baseline verified against GitHub main on 2026-11-19:

- `ALENZACODES/access-main`: `588dbca798c9876342cbfa74d4fc50ca788558c9`
- `ALENZACODES/access-help`: `4ebf580b597dd9aaed55fc9ab6213516fac518a8`
- `ALENZACODES/access-maps`: `556cec3ffad363c8204ff69fe4c571bea1edb170`
- `ALENZACODES/access-tools`: `6f35cecd184fc6e87b44930e2bb67ae7b1574f44`

## Files

All ten `.mjs` files in `access-main/scripts/release` are NEW and are absent from main as checked. The ZIP contains complete files (not a diff). No earlier delivered files were included.

The modules implement a bounded, evidence-backed incident register for OFFLINE software release review. They provide stable lifecycle operations, source provenance validation, human-review planning, conservative change detection, and text, CSV, HTML and JSON exports. The feature has no network calls, storage writes, scheduled work, eligibility or medical advice, or physical-place assertions. All claims stay `UNKNOWN`; administrative review status is never a certification.

## Imports from existing main

- `scripts/release/site-audit.mjs`: existing `isOpenLicence`, `isValidDate` — do not overwrite it with the local test fixture.
- `packages/shared/test/forbiddenOrg.ts`: existing `forbiddenOrgNeedles` helper used by policy tests — do not duplicate it.
- All other relative imports are new files included in this ZIP.
- `node:crypto`, `node:assert/strict`, `node:test`, `node:fs/promises`, and `node:url` are Node built-ins.

## Checks performed locally

- 2,126 new nonempty source/test file lines across ten files.
- 161 focused Node tests: 161 passed, 0 failed.
- Node syntax validation for each new JavaScript module.
- Source policy tests: forbidden-organisation needles, no literal U+00A0/U+202F source characters, and no network/schedule calls.
- Existing-main dependency APIs matched the live `site-audit.mjs` contract.
- The complete root `npm run lint` could not run in this working folder: it lacks the full repository checkout and package.json. Do not interpret the focused test pass as full CI or typecheck/axe certification.

To exercise the new suite within the repository: `npm run test:release` (existing package script collects `*.test.mjs`). The new modules are not inserted into a release gate automatically. Release and runtime decisions remain human-reviewed.

## Existing red PR

PR #221 (`chatgpt/p19-r29`) has a reported lint failure caused by two unused imports in `offline-release-contract.test.mjs`. The complete fixed file was delivered in the preceding R30 ZIP, but the remote branch may still be red until that file is applied. This R31 package does not resend the earlier module or override unmerged branch work.
