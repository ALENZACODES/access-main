# P16 Round 16 — offline publication history

A small immutable auditing utility for bilingual EN/FR accessibility records.
It does not request external resources, edit cached data, select evidence tiers
or infer source facts. The caller supplies records and an explicit `asOf` date.

## Contract

Each snapshot provides `id`, `locale`, `revision`, `title`, `capturedOn`,
`cacheState`, optional `assetPath` and a `source` object containing `name`,
`url`, `licence`, `collectedOn` and `tier`. When `cacheState` is `cached`, a
canonical `/offline/` path is mandatory. Other states must omit `assetPath`.
Source attribution must use an HTTPS URL without embedded credentials or a
fragment. Dates use ISO calendar days. The tier is one of `primary`,
`secondary`, `community` or `unknown`.

Snapshots for the same `id` and locale are ordered by revision. The audit flags
duplicate revisions, revision gaps and capture-date regressions. It can require
an EN/FR counterpart. Distinct records must not claim the same cached asset.
The audit returns stable issue codes and field paths, not record text.

## Commands

```sh
node --check scripts/p16-offline-history-round16.mjs
node --check scripts/p16-offline-history-round16.node.mjs
node --test scripts/p16-offline-history-round16.node.mjs
```

The test uses the built-in Node test runner and an explicit `.node.mjs`
suffix, avoiding competing discovery by Vitest. The source is dependency-free.
It is deliberately additive: no package manifest or workflow file changes are
needed. Existing DOM-ID and keyboard regression suites remain unchanged.
