# Offline pack receipts

The receipt panel is an optional, manually opened part of the offline dashboard.
It records a metadata-only reading of the current region manifest and the
dashboard's current cell inventory. A receipt includes the region, capture
time, listed cell IDs, byte counts, source name, licence, source date, local
state, and a SHA-256 digest of the canonical receipt payload.

The digest is an integrity fingerprint for accidental changes. It is not a
signature, does not identify the author, and does not attest to the source.
A matching digest does not prove that a downloaded payload is still present.
Imported receipts are historical records and never establish current device
storage. Physical accessibility remains UNKNOWN.

## Capture and comparison

- The person opens the panel and explicitly records a reading.
- An absent, incomplete, duplicate, mismatched, or unreadable inventory
  produces UNKNOWN rather than a positive saved state.
- The history is held in page memory and is limited to twelve readings.
- Comparisons are between two chronological readings of the same region.
- Search, filtering, sorting, and pagination operate on receipt metadata.
- Import accepts a pasted JSON history only after its schema and every digest
  have been checked. Import replaces only this page's in-memory history.
- JSON and text exports require an explicit action. No pack payload bytes,
  storage paths, coordinates, device identifiers, or user profile fields are
  included.

The panel does not download, delete, upload, or modify stored pack cells. It
does not poll, schedule work, or persist history automatically. Clearing the
panel history does not affect downloaded data.

## Checks

From the repository root, run npm run lint, npm run typecheck, npm test,
npm run build, and npm run check:web-precache -w @access-main/budgets.

The unit tests cover canonical digests, malformed receipts, UNKNOWN handling,
history limits, import/export, chronological comparisons, and pagination.
The panel tests cover explicit capture, paste import, invalid digest handling,
bilingual copy, controls, and unmount cleanup.
