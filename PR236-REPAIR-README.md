# PR #236 lint repair — current main baseline

Baseline: `a7d1bff745f1ff312bf84d1dd5b53e640fc25c90`.

Complete replacements:
- `model.ts`: replaces control-character regular expressions with a code-unit scan; preserves CSV formula-marker protection.
- `integration.node.mjs`: removes the unused `stepMachine` import and uses `globalThis.URL`.
- `package.json`: current-main scripts and dependencies, preserving the complete `p20aj`, `p20am`, `p20al`, and `p20an` test entries and adding the switch-workbench integration node test.

The integration module imports the existing sibling `engine.ts`, `audit.ts`, `report.ts`, and `copy.ts` from the PR #236 workbench. Those are existing PR files and are not modified by this lint-only repair.

Direct local imports used by `integration.node.mjs` are included in this archive:
`model.ts`, `engine.ts`, `audit.ts`, `report.ts`, and `copy.ts`.
`WorkbenchPage.tsx` also imports these same modules; its full file is part of PR #236's
existing changed-file set and must remain unchanged when applying this lint-only fix.
