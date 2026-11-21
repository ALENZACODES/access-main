# PR #236 lint repair

Baseline: current `origin/main` at `a7d1bff745f1ff312bf84d1dd5b53e640fc25c90`.

Complete replacements for the two reported lint failures:
- `model.ts` scans code units for C0/DEL controls using `charCodeAt`; CSV formula-prefix protection remains active.
- `integration.node.mjs` drops the unused `stepMachine` binding and constructs its URL with `globalThis.URL`.

The complete direct local dependency closure for the integration test is included: `engine.ts`, `audit.ts`, `report.ts`, and `copy.ts`. The root `package.json` is the current-main snapshot with the integration test appended to `test:scripts`; the pre-existing p20aj, p20am, p20al, and p20an entries are retained.
