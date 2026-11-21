# P19 R37 — Offline Precache & Recovery Audit

This package adds source-backed, on-device release checks under the existing flat `scripts/release/` path. It does not add external dependencies, GitHub Actions workflows or background tasks.

**Repository baseline (checked):** `ALENZACODES/access-main` `1fb71d5e3138f136b9cfe980e552ff1667219312`.

## Included

- `precache-contract.mjs` — bounded provenance, locale, path, graph and source metadata checks
- `precache-files.mjs` — read-only bytes/hash audit; symlinks and unsafe paths fail closed
- `precache-delta.mjs` — deterministic release changes and dependent asset impact
- `precache-report.mjs` — localized English/French CSV, HTML, JSON and text
- `precache-cli.mjs` — explicit manual inspect, scan and compare commands
- `precache-index.mjs` — barrel exports
- Six corresponding Node test suites
- Complete `scripts/release/package.json` with manual `audit:precache` command

Existing dependencies on current main, deliberately not duplicated: `scripts/release/site-audit.mjs` and `packages/shared/test/forbiddenOrg.ts`.

## Safety and interpretation

- `UNKNOWN` is preserved; a check makes no claims about real places or field accessibility.
- Each asset includes source, licence, retrievedOn and tier.
- Offline-pack assets are restricted to **524,288 bytes** per listed chunk. The ceiling is not increased.
- Reading local files never downloads assets. The CLI creates a report file only when an explicit `--output` path is supplied; it cannot overwrite an existing file.
- No claim of an agency, city or other body's endorsement or affiliation.

## Tests and limitations

- Focused local tests: **339 passed**, zero failures (run with `npm test` in the isolated release subpackage).
- `node --check`: **12/12 passed**.
- TypeScript parse/module check for the six runtime modules: passed with NodeNext settings and `--allowJs --checkJs false --noEmit`.
- Local policy tests check forbidden organisation names using the existing shared helper, missing metadata, French punctuation and unsafe inputs.
- `npm run lint` in a full repository checkout could **not** run: the full root checkout and ESLint dependencies are not mounted in this environment. This package is **not certified** as repository-wide lint- or CI-green.
- Full application typecheck, production build, compiled precache byte budget and browser axe tests must be run in the repository. The isolated contract and file tests do enforce the 524,288-byte per-chunk ceiling.

## Integration

Apply the complete files to a fresh branch from the baseline or later main, preserving `scripts/release/` paths. Run root lint, typecheck, tests, build and budget checks before merging. Existing scripts and checks are not weakened.
