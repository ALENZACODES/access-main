# P20O: runner compatibility and evidence contracts

`p20l-provenance.spec.ts` uses Playwright's supported `test(...)` function
inside `for...of` loops. Its adjacent `p20l-provenance.ts` implementation
is included so the suite imports only files present on the fresh main branch
or in this package.

`playwright-api-guard.spec.ts` runs automatically in the existing Playwright
e2e directory. It parses the project's `*.spec.ts` and `*.spec.tsx` files
with the TypeScript parser and fails if unsupported Vitest-style collection
methods are used. Comments and strings are not interpreted as executable
calls. It has its own positive and negative regression tests.

Run from the repository root with the existing test commands. A failed
collection step is not an axe failure. No new dependencies, secrets, datasets,
or recurring workflows are needed. Evidence that is absent remains UNKNOWN;
this package makes no claims about specific places or routes.
