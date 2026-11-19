# P16 Round 23: offline evidence publication pipeline

This is an additive, self-contained set of read-only modules for reviewing
bilingual offline accessibility evidence before it reaches user interfaces.
It consumes caller-supplied records and makes no network requests, cache writes,
account changes, timer registrations, or external side effects.

## Included modules

- `contract.mjs`: bounded record schema, bilingual copy, source attribution,
  licence, ISO dates, offline paths, duplicate records, and diagnostic codes.
- `readiness.mjs`: source age, cache age, uncertain evidence, paired EN/FR
  readiness, policy windows, and source coverage.
- `changes.mjs`: side-effect-free add/replace/retain/review/retire proposals,
  date/revision regression detection, pair reconciliation and capacity plans.
- `export.mjs`: attributed CSV, JSONL, structured JSON, change CSV, and
  privacy-safe diagnostic summaries.
- Four `.node.mjs` suites and one fixture helper cover 369 cases. Tests never
  require a service, external source, real addresses, or network access.

## Record contract

Each record carries a canonical `id`, shared `translationKey`, `language` (`en`
or `fr`), kind, `state` (`SUPPORTED`, `UNSUPPORTED`, `UNKNOWN`), positive revision,
recorded date, EN/FR title and summary, attributed source list, and offline
cache state (`PRESENT`, `ABSENT`, `UNKNOWN`). Each source has a canonical ID,
EN/FR title, HTTPS URL, publisher, licence, collected date, tier (`PRIMARY`,
`SECONDARY`, `COMMUNITY`, `UNKNOWN`) and claim. A present cache has a safe
first-party path, capture date and positive byte count.

An uncertain source or absent cache never becomes a supported claim. A fully
unknown pair remains `UNKNOWN` unless a structural or policy error requires a
`HOLD`. Publication decisions distinguish content problems from uncertainty.
No display copies or raw source descriptions are included in diagnostics.

## Operations

- `findRecordIssues`, `auditCollection`: inspect without modifying records.
- `recordReadiness`, `pairedReadiness`: evaluate current date and source/cache
  freshness against explicit policy limits.
- `compareSnapshots`: build proposals, never delete or write any cache entry.
- `planResourceBudget`: count distinct local cache resources and byte budgets.
- `exportEvidenceCsv`, `safeJsonLines`: only emit rows for structurally sound
  records; escape formula-like cells and use a fixed, attributed header.
- `exportDecisionJson`, `exportBilingualStatus`: produce language-independent
  decision codes for separate EN and FR UI translation layers.

## Running the tests

From repository root, after dependencies are installed:

```sh
node --experimental-strip-types --test scripts/p16-publication-round23/*.node.mjs
npm run test:scripts
npm run lint
npm run typecheck
npm test
```

The complete `package.json` included in this package is copied from the
current mainline and changes only `scripts.test:scripts`. It explicitly lists
all existing P16 Node suites plus this round's four suites. Vitest continues
to own `*.test.mjs`; the `.node.mjs` suites are owned exclusively by Node.
Existing merged DOM-ID and keyboard tests stay unchanged.

## Scope limits

An audit result is not a substitute for manual assistive-technology testing,
licence review by the data owner, or direct inspection of changing source data.
The package does not claim source facts to be correct and does not make
requests to check them. Review proposals are not applied automatically.
