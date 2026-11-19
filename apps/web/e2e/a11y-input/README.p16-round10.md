# P16 Round 10: bilingual, offline record-provenance checks

Base: `ALENZACODES/access-main` `main` at
`f7dac4d62d21ed81cded8ddafaf23de85e92b1ca`.

New files:

- `record-audit-round10.ts`: read-only record audit with EN/FR fields, source,
  licence, collection date, evidence tier and offline-copy metadata.
- `record-audit-round10.node.mjs`: 51 isolated Node tests for both accepted
  records and intentionally broken examples.

No application code, dependencies, config, package manifest, generated assets,
or existing merged tests are replaced. All local imports from the new test
file resolve to the new source file in this archive. The Node built-in test
and assertion modules require no additional dependencies.

## Run focused checks

From the repository root:

```sh
node --experimental-strip-types --test apps/web/e2e/a11y-input/record-audit-round10.node.mjs
tsc --strict --noEmit --target es2022 --module nodenext --moduleResolution nodenext apps/web/e2e/a11y-input/record-audit-round10.ts
```

These focused checks supplement, rather than replace, the repository checks:

```sh
npm run lint
npm run typecheck
npm run test
```

## Contract

Each record carries a kind, a stable slug, complete English and French title
and summary, source references, a source publisher, public HTTPS source URL,
licence, ISO collection date and one evidence tier. A record's offline copy
is explicitly stored, not stored or unknown. Stored copies require a safe
local path and capture date. A record may retain multiple independent sources.

Records are treated as untrusted input. Dates are calendar-checked; missing
language content, duplicate record and source IDs, unsafe URL/path values,
future collection dates and inconsistent offline dates produce location-only
diagnostics. The module does not access a network, make up source data, or
silently promote unknown source quality into a stronger evidence tier.

The audit is a data-quality contract, not evidence that any particular
record or publisher is accurate. It must not be used to label user-facing
records as authoritative on the strength of schema checks alone.

## Local execution boundary

The focused Node suite and strict source compilation passed in the isolated
working environment. Full repository lint, typecheck and test tasks require
a dependency-installed checkout, which was not available in this environment.
Do not treat this archive as having passed the full repository CI suite.
