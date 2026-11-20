# P20AH — Offline evidence handoff and route continuity audit

Baseline: access-main `9bf9a4f6ecafb750d89d7616753468ce80386cb1` (current main at inspection).

## Integration

Apply all supplied complete files at the exact repository-relative paths beneath `access-main/`. `p20ah-index.ts` is the new contract barrel. The Playwright runner discovers `p20ah-live.spec.ts`; the root `test:scripts` registers six `p20ah-*.node.mjs` suites, and registers the previously omitted `p20ad-offline-contracts.node.mjs`.

The root `PR-BODY.md` was already tracked on main. To delete it, remove the file or apply `patches/remove-tracked-root-pr-body.patch` from the repository root. `DELETE_FILES.txt` records the deletion. Omitting the old file from an archive alone does not delete it.

## QA corrections

- `p20ad-offline-copy.ts`: both `connectivityUnknown` messages and both `evidenceMissing` messages use the literal `UNKNOWN`, not a localized/lowercase substitute.
- `package.json`: retain all pre-existing scripts, add P20AD, add six P20AH suites. Do not introduce scheduled workflows.
- `a11y-input/helpers.ts`: complete file with narrow undefined guards for extracted route captures. `appRoutes()` still reads the live router tables.

## New checks

- Evidence packet provenance, date, state, licence, tier and schema integrity; UNKNOWN never becomes a fact.
- Multi-step offline cutover, route history, language, focus and export replay, with explicit failure diagnostics.
- English/French text and CSV handoff, including CSV formula escaping, a UTF-8 BOM and French typography.
- Observed browser language, headings, control names and target geometry; offline transition using Playwright's context offline toggle.
- Resource/cache outcome and per-entry 524,288-byte precache policy; unknown bytes do not pass as measured bytes.
- Complete EN/FR offline/online matrix generated from `appRoutes()` rather than a hardcoded route count.

## Validation status

Local focused Node suite: 721 tests passed (P20AH 451 + existing P20AD 270).
Local isolated strict TypeScript: passed with `noUnusedLocals`, `noUnusedParameters`, and `noUncheckedIndexedAccess` and external Playwright test stubs.
Full repository ESLint, Playwright browsers, and actual built precache were not runnable because this working environment has no complete installed repository checkout. No claim of full CI success is made.
