# Manual offline recovery batches

This feature is mounted on the existing `/offline` page through
`mountOfflineDashboard`, and its public exports are in `robust/index.ts`.
The user chooses when to estimate storage and whether to start an individual
batch. Nothing downloads, uploads, deletes, or schedules itself.

## Planning rules

- The current manifest supplies the exact cell IDs, byte counts, source,
  open licence and source date. No source details are inferred.
- The device's current inventory is read through the existing dashboard.
  A missing, duplicate, unlisted or contradictory inventory disables all
  automatically suggested batch actions. UNKNOWN remains UNKNOWN.
- Only a locally observed missing or stale cell whose manifest metadata
  matches the inventory is an automatic download candidate.
- Unreadable or metadata-conflicting cells are for inspection, not automatic
  retry. Saved cells are never redownloaded by this feature.
- A browser storage estimate is advisory, and the planner reserves at least
  1 MiB. A missing or invalid estimate cannot authorize a batch.
- The plan splits by exact source/licence/date triples, per-batch byte cap,
  and number of cells. A source date change is a distinct group.
- Before each explicit batch request, the panel refreshes the inventory,
  compares a metadata-only fingerprint, rechecks storage, and rejects changed
  selections. The existing `DashboardModel.downloadSelected` is the only
  mechanism allowed to start the selected download.
- Source evidence tier remains the literal `UNKNOWN`; a matching saved copy
  proves nothing about physical accessibility or source documentation tier.

## Accessibility and internationalization

English and French strings are defined in `recoveryBatchesCopy.ts`. French
uses typographic apostrophes and nonbreaking spacing where punctuation calls
for it. Both languages display the exact `UNKNOWN` token. Controls are native
buttons, selects and labelled search input with at least 44px targets; the
status region announces changing results without moving keyboard focus.

## Local export

The user can explicitly download a text or JSON plan. Each row includes
cell ID, offline state, reason, expected bytes, source, open licence, source
date and the UNKNOWN tier. The report contains no cell payload, browser ID,
account data or user-search value. It is never transmitted.

## Tests

- `recoveryBatches.test.ts`: provenance, inconsistent inventories, quota,
  safe batching, source groups, filters, sorting and snapshot checks.
- `recoveryBatchesExport.test.ts`: bilingual report formats, metadata-only
  export, the UNKNOWN token and safe filenames.
- `recoveryBatchesWiring.test.ts`: live dashboard mount, public barrel,
  preservation of existing mounts, and explicit downloadSelected call.

Run the repository's regular `npm run lint`, `npm run typecheck`, and `npm test`
from a clean checkout with the existing workspace dependencies installed.
