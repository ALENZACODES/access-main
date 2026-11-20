# Offline issue casebook

This browser-only feature lets a person record a short, structured history of
issues affecting explicitly listed offline cells. It mounts through
`offlineDashboard.ts` on the existing `/offline` route and uses the shared
`createOfflineAction` helper for minimum 44 CSS-pixel controls.

The casebook is kept in page memory. Opening a case, adding a note, changing
its status, reconciling with a currently available inventory, importing a
casebook and exporting it all require explicit user action. The feature does
not read payload bytes, make requests, save records in background storage,
contact a server, request a background permission or schedule a workflow.

Each entry records region and cell IDs, issue reason, source, open licence,
source date, expected bytes, current evidence token and timestamped note
events. An absent, incomplete, inconsistent or unreadable inventory produces
`UNKNOWN`. Historical imported entries are **not** treated as evidence that
a cell is available on the current device. A closed note does not alter the
cell's status. Changes to a source's name, licence, date or listed byte count
block a historical record from being silently reconciled to a new listing.

The casebook has finite entry, event, note and file-size limits; import uses
strict UTF-8 decoding, schema checks and event-order constraints. Exports may
contain user-written notes. People are warned to store them privately.
Files contain metadata and notes but no downloaded offline-cell payloads.

Both English and French use the exact `UNKNOWN` token, French curly
apostrophes and the required spacing before punctuation. The interface uses
native labelled form controls, a polite live region, and no tiles or images.
Nothing in this feature represents physical accessibility or eligibility.

Tests include historical record validation, manifest/inventory conflicts,
state transitions, file limits, source/licence/date retention, bilingual copy,
export and browser interactions. Run from a complete repository checkout:

```sh
npm run lint
npm run typecheck
npm test
```
