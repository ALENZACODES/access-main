# P16 offline publication packet — round 24

This add-only chunk provides a deterministic offline publication pipeline built
on the currently inspected access-main mainline. It does not mutate a browser,
cache, source record, repository, or external service. The five modules are
independent of any unmerged branch. They share helpers from `core.mjs` and
use synthetic fixtures only for tests. An actual record is always supplied by
a caller and retains its original source, licence, collection date and tier.

## Data contract

Each record carries a stable canonical ID, a kind, localized `title` and
`summary` objects with `en` and `fr`, an explicit access state and evidence
tier, a source with publisher, HTTPS URL, licence and collection date, a
review date, positive revision and a cache observation. `cache.state` may be
`stored`, `missing` or `unknown`. Only a stored observation can include a local
asset path and saved date. These fields are observations, not guarantees of
physical access or the present status of a service.

Unknown values remain `UNKNOWN` in the user-facing publication decision. A
malformed field produces `HOLD`; missing evidence does not turn into a
positive claim. An unambiguous clean and current stored copy receives `READY`,
meaning that the supplied copy satisfies this limited publication contract.
Neither a receipt nor a `READY` state establishes an external accessibility
claim; real-world observation still requires its own evidence.

The language auditor checks French typography, including the typographic
apostrophe, the nonbreaking space before a colon, the narrow nonbreaking
space before semicolons, exclamation marks and question marks, and the
narrow internal spaces in guillemets. `formatFrenchCopy` is an explicit,
opt-in authoring helper. Audit and publication paths never modify source copy.

The snapshot planner proposes `ADD`, `REPLACE`, `KEEP`, `HOLD`, `UNKNOWN`, and
`REVIEW_RETIRE`. It never deletes records or writes cache entries. Changes
without a revision bump, date regressions and cache collisions are reported
using structural paths rather than untrusted record values.

Exports are stable CSV, JSON and JSONL. CSV fields are properly quoted and
leading spreadsheet-formula characters are shielded. Only structurally sound
records reach the row exporter, and diagnostics never echo record titles,
private descriptions or source URLs. Use `buildPublicationExport` and then
`publicationCsv`, `publicationJson` or `publicationJsonl` for read-only outputs.

## Execution

Run focused tests from the repository root:

```sh
node --test scripts/p16-packet-round24/*.node.mjs
node --check scripts/p16-packet-round24/core.mjs
node --check scripts/p16-packet-round24/readiness.mjs
node --check scripts/p16-packet-round24/changes.mjs
node --check scripts/p16-packet-round24/export.mjs
```

The file extension `.node.mjs` intentionally avoids Vitest discovery. This
package adds no workflows and does not change package settings. Existing P16
DOM-ID regression suites remain on main and must continue to run in browser
CI. These Node tests complement, not replace, real keyboard, screen-reader or
switch input testing.

### Constraints

The modules make no network calls, read no files, persist nothing and infer no
future source status. Callers supply explicit policy dates. Invalid data fails
closed. This packet is not a remote asset fetcher, cache installer or source
claim upgrader. It contains no operational secrets or production records.
