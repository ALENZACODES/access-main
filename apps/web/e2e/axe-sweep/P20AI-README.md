# P20AI: offline interaction trace correlator

This test-only package adds read-only offline interaction tracing, resource/cache
readiness checks, keyboard focus and announcement contracts, and deterministic
bilingual evidence custody exports. It does not make claims about real places.
Unknown measurements remain `UNKNOWN`; evidence requires source, licence,
retrieved-on date and tier. Synthetic unit fixtures are not place records.

## Integration

The barrel `p20ai-index.ts` exposes every new model and browser observer. The
Playwright runner discovers `p20ai-live.spec.ts` automatically. The complete
root `package.json` registers six Node test suites in `test:scripts`, preserving
its existing script entries. The live route inventory comes from `appRoutes()`;
it does not pin a route count. The bounded browser smoke complements the
existing exhaustive axe route sweep.

Extract file paths relative to `access-main`. `DELETE_FILES.txt` instructs
removal of an already tracked root PR body; omitting it from a ZIP would not
remove the file from Git. No workflows, secrets, symlinks or lockfiles added.

## Validation performed in this standalone workspace

- `node --experimental-strip-types --test apps/web/e2e/axe-sweep/p20ai-*.node.mjs`: 469 passed
- strict TypeScript with noUncheckedIndexedAccess and unused-symbol checks: passed
- syntax, static naming, file size, archive integrity: checked

Not executed here: complete repository ESLint, production build/precache check,
or browser Playwright/axe run. These require the full repository checkout and
its installed dependencies. Do not report CI green solely from these checks.
