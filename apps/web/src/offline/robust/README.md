# Offline region robustness

The live `/offline` page (`src/offline/RegionPackPage.tsx`) downloads each
region cell by cell through these rules. It adds no endpoints, tile servers,
background tasks or automatic network requests: a download starts only when
someone presses the button.

## Pieces

- `regionDownload.ts`: the rules. `downloadRegion` checks free space before each
  cell, stops on quota, a failed cell or a pause, and resumes by skipping cells
  already saved. `lookupOfflineCell` and `regionCellReport` give each cell one of
  four statuses. `cellStatusText`, `cellSummaryText` and `downloadResultText`
  give the English and French wording.
- `packCells.ts`: the link to the region pack in `packages/data-client`.
  `regionManifestFor` turns a pack region into one cell per pack cell, with its
  byte count and its source, licence and build date. `createPackCellStore`
  combines the pack store (which holds the records) with a small IndexedDB
  ledger (`access-region-cells-v1`) that records which build each cell came from.
  The pack's `downloadCell` checks size, digest and record count for every part
  of a cell before writing that cell.

## Statuses

| Status | Meaning | Shown as |
| --- | --- | --- |
| available | The saved copy matches the current build. | Available offline, with the data date |
| stale | A copy is saved, but from an older build. It is not used offline. | Out of date, with the saved date and the current date |
| missing | Nothing is saved for this cell. | Not downloaded |
| unknown | The cell is not in the manifest, or the device could not read it. | UNKNOWN |

A stale cell is never shown as UNKNOWN and never as current. A missing cell is
never hidden: the region shows how many cells are saved and how many are not.
**Offline availability does not establish physical accessibility.**

If free space cannot be read, or is below the cell size plus a 1 MiB reserve,
the download stops before that cell. Deleting a region removes its records,
older copies and ledger rows.

## Accessibility

Buttons and the cell summary are at least 44 × 44 CSS pixels, results are
announced in a status or alert region, and the cell list sits in a native
`details` element that opens with the keyboard (WCAG 2.2 AA).

## Tests

- `regionDownload.test.ts` and `packCells.test.ts` (Vitest).
- `packages/data-client/src/index.test.ts` covers `downloadCell`.
- `e2e/offline-robust.spec.ts` runs the live page in English and French against
  a fixture pack: a failed cell is reported missing, Resume fetches only that
  cell, and after a new build the changed cell reads Out of date while the
  unchanged cell stays current. axe runs on each state.
