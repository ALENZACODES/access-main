# P20W: route-language, provenance and interaction evidence

This is a standalone P20 accessibility test chunk prepared from `access-main` main
`a6e08a74ace668eba4e6f814b09eaec99df4c5e6`.

## What changes

The new files are confined to `apps/web/e2e/axe-sweep/`. They neither change
application copy nor add persistent storage, telemetry, scheduled tasks or
third-party calls. No existing file from main is replaced.

- `p20w-attribute-live.spec.ts` gets **all static routes** from the existing
  `appRoutes()` helper. It checks the five accessibility text attributes in
  English and French, using the previously merged P20U language contract.
  Route-specific `test.step` labels keep failures identifiable. The existing
  axe suite already tests both 320px and 1280px; this additional live sweep
  uses 320px to avoid multiplying CI navigation work.
- `p20w-attribute-browser.ts` takes read-only snapshots of accessible-name
  attributes and the leaf text fragments needed for typography analysis.
  It honours hidden ancestors and nested language marks.
- `p20w-route-coverage.ts` defines route identity, matrix coverage and
  navigation/locale-transition policies without assuming a fixed route count.
- `p20w-evidence-contracts.ts` defines uncertainty-preserving metadata checks
  for source, licence, date and tier. UNKNOWN never becomes a default fact,
  and source metadata does not imply that a physical location is accessible.
- `p20w-french-typography.ts` audits French copy for U+2019, U+00A0 before
  colons, U+202F before semicolons, exclamation and question marks, and U+202F
  inside French guillemets. Its draft formatter is not called on live app text.
- The matching `.spec.ts` files cover malformed/absent values, language
  inheritance, static route identity, low-resolution viewports and dynamic DOM
  updates.

## Imports and integration

All newly introduced local modules and their tests are present in this archive.
The only imports outside these new files are existing current-main modules:
`../a11y-input/helpers`, `./p20u-attribute-language`, and
`../../../../packages/shared/test/forbiddenOrg`, plus Playwright. Those
existing modules stay on main and must not be overwritten with stale copies.
No package manifest or lockfile changes are required.

## Running in a full repository checkout

From the repository root, with dependencies installed:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:e2e --workspace=@access/web -- --project=chromium --grep 'P20W'
```

The browser fixture and live specs are collected by the current Playwright
configuration. CI status cannot be inferred from an isolated compilation.

## Checks available in the authoring environment

- All nine new TypeScript files passed strict TypeScript checking with
  temporary declarations for external dependencies, including unused-symbol
  checks. The temporary declarations are **not** in the archive.
- 213 focused pure contract cases passed using a local test facade.
- 20 actual Chromium browser smoke checks passed at 320px and 1280px using
  the Python Playwright driver and the generated browser collector.
- Full repository lint, workspace typecheck and browser E2E could not run
  without the complete repository checkout and installed dependencies.

No claim of an externally confirmed CI-green run is made for this chunk.
