# P19 R32 — Offline release retention controls

Base refs checked 2026-11-19:
- access-main `588dbca798c9876342cbfa74d4fc50ca788558c9`
- access-help `4ebf580b597dd9aaed55fc9ab6213516fac518a8`
- access-maps `556cec3ffad363c8204ff69fe4c571bea1edb170`
- access-tools `6f35cecd184fc6e87b44930e2bb67ae7b1574f44`

## Apply scope

Six **new** files in `scripts/release/offline-release-retention*.mjs` and the complete corrected `offline-release-contract.test.mjs` for PR #221. The unchanged dependency `offline-release-contract.mjs` (Git blob `0c89d7ecd06ff099aa09f9939b6bbcbd31e5abc4`) is included because the corrected test imports it and that PR is not merged. `site-audit.mjs` is an existing current-main dependency, **not included or modified** to avoid overwriting the main branch with a stale version.

Do not apply the PR #221 correction to main unless the corresponding module exists there. Apply the corrected test and its unchanged companion to PR #221; apply the six new retention files to a new branch made from current main. No old or merged feature files are part of this round.

## New behavior

- A strictly offline, source-backed retention register for release artifacts with explicit `present`, `quarantined`, `withdrawn`, and `retired` lifecycle transitions.
- Mandatory source, accepted licence, retrievedOn, canonical tier, bilingual labels, asset digest, byte limit, and explicit claim states. `UNKNOWN` never changes automatically.
- Reference validation with duplicate, missing, self, cyclic, and depth checks.
- Stable canonical JSON and SHA-256 fingerprints, immutable transition operations, before/after release comparison, and reverse dependency impact.
- EN/FR text, HTML, CSV, JSON and change reports. HTML escapes supplied text and uses structural table headers and main landmarks; CSV neutralises formula-leading cells.
- No network calls, location claims, personal records, scheduled work, or external packages.

## Local validation

- `node --test scripts/release/*.test.mjs`: **238 pass, 0 fail** (169 new retention tests plus 69 corrected PR contract tests) with the existing `site-audit.mjs` available as a local stand-in. Its fetched local copy is not part of the ZIP.
- `node --check` for all JavaScript source and test files: passed.
- Source scan for literal U+00A0/U+202F and repository `forbiddenOrgNeedles()`: passed.
- `npm run lint`: **not completed**. The standalone staging directory has no root `package.json` and full checkout/dependencies are not available. No claim of repository-wide lint/typecheck/CI/axe success.

## File counts

The six new release-retention source/test files total **1,640 physical lines** (substantive code and tests only; no JSON/fixtures/padding). The corrected PR test and unchanged module are additional and excluded from that count.

## Integration constraints

Do not alter main's `site-audit.mjs`, existing package scripts, CI workflow, or pinned lanes. The new `*.test.mjs` files are automatically picked up by the existing release Node test runner (`node --test --experimental-strip-types *.test.mjs`). Run the full root `npm run lint`, `npm run typecheck`, and `npm test` in a complete checkout, then review CI before merging.
