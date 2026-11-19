# P20V — Accessible widget-state contracts

This chunk audits rendered ARIA widget states without changing the application,
network, storage, background jobs, or any persisted records. It is intentionally
not a replacement for axe or end-to-end interaction checks.

## Added files

- `p20v-state-contracts.ts`: pure state and reference validators.
- `p20v-state-contracts.spec.ts`: deterministic positive and negative tests.
- `p20v-state-browser.ts`: read-only Playwright DOM collection.
- `p20v-state-browser.spec.ts`: realistic 320px / 1280px browser fixtures.

## Coverage

- Legal state values and role/state combinations.
- Current destination uniqueness within each separate navigation.
- Sort state exclusivity within each separate table.
- Active descendant exists exactly once, is visible, is an appropriate role,
  and belongs to its composite widget through containment or ownership.
- Duplicate identifiers, including hidden duplicates.
- Dynamic disclosure updates and independent multi-navigation state.

## Limits

The detector does not infer language from words, infer a facility's accessibility,
or assign provenance, licences, dates or evidence tiers. It also does not walk
keyboard focus. Existing sweeps retain responsibility for those checks. Nothing
in this package grants an accessibility rating or changes UNKNOWN evidence.

## Suggested local checks

Run from the repository root after installing the existing lockfile dependencies:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:e2e -- --grep 'P20V'
```

The two Playwright specs use the repository's existing test environment and do
not require any package or workflow modifications. The collector uses only
read-only DOM queries. The source files are new and import only each other and
already-installed Playwright types/runtime.
