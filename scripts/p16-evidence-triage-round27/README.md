# P16 Round 27 — offline evidence triage and provenance lineage

This folder implements a deterministic, read-only accessibility publication audit. It does not claim that an entrance, route, washroom, or service is usable merely because a record or cached copy exists. Source claims, cache availability, and record accessibility status are distinct fields. The caller supplies the records; these modules do not fetch remote content, access credentials, mutate storage, or publish anything.

## Modules

- `contracts.mjs` checks record identities, EN/FR fields, source URLs, licence strings, collection dates, evidence tier, source claim, offline paths, revision numbers, and asset ownership.
- `readiness.mjs` applies explicit caller policy for source age, capture age, maximum bytes, bilingual completeness, and community evidence handling. Its result is `READY`, `HOLD`, or `UNKNOWN`. `READY` means the metadata meets publication policy, not that the physical feature has been assessed.
- `changes.mjs` compares snapshots and returns non-executing `ADD`, `REPLACE`, `RETAIN`, `REVIEW`, and `RETIRE` proposals. Its resource inventory reports duplicate cache ownership and budget conditions.
- `export.mjs` returns stable CSV, JSONL, summary JSON, and diagnostic CSV. CSV cells receive formula-prefix shielding; copied text is not included in decision or diagnostic output.
- `lineage.mjs` detects revision regressions, changed sources without a revision increment, cache changes without a revision increment, source attribution drift, and unsafe rollback candidates.
- `fixtures.mjs` is a test-only synthetic record factory and must not be consumed as live evidence.

## Explicit model

Records have an `id`, `translationKey`, `language`, `kind`, `access`, `revision`, `recordedOn`, bilingual `title` and `summary`, an array of `sources`, and `cache`. Source attribution contains `id`, `publisher`, `url`, `licence`, `tier`, `claim`, and `collectedOn`. A stored cache includes `state`, `path`, `capturedOn`, `revision`, and `bytes`. A pair consists of records using the same translation key in both `en` and `fr`, with distinct language-specific IDs and asset paths.

UNKNOWN is not a positive claim. Any source tier or claim marked `UNKNOWN`, an unknown accessibility state, or an unknown cache state remains explicitly uncertain. A missing language or structurally invalid source causes `HOLD`, not a fabricated fallback. Cache presence does not strengthen evidence tier.

French presentation checking is optional and enforces curly apostrophes, U+00A0 before colon, U+202F before semicolon/exclamation/question mark, and U+202F inside guillemets. EN and FR records use the same evidence contract. Callers control `asOf` explicitly; no function reads the system clock.

## Running tests

From the repository root:

```sh
node --test scripts/p16-evidence-triage-round27/*.node.mjs
npm run test:scripts
npm run lint
npm run typecheck
npm test
```

The root `test:scripts` command includes the prior P16 Node suites, including R20, R21, R23 and R24, plus the five suites in this folder. No recurring workflow or new dependency is required.

## Boundaries

- There are no location coordinates, map-route claims, or live facts in this implementation.
- Record diagnostics contain stable paths and codes rather than supplied descriptions.
- The change planner proposes actions; it never calls a storage or publication API.
- Rollback candidates are not automatic restore commands, and older revisions require manual review.
- Open-shadow-root or browser keyboard behaviour must be covered by the existing browser suites, not by this pure-data layer.
- These tests are regression gates, not a substitute for screen-reader and physical switch sessions.
