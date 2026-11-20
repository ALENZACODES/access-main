# Place sheet, take-along files and gaps grid

What the pack records for one place, field by field, and ways to take places along. Everything is
made on the device from the pack already loaded. Nothing is uploaded and nothing is stored.

## Files

| File | Role |
| --- | --- |
| `placeSheet.ts` | `buildPlaceSheet`: nine details (name, tag, kind, address, map point, source, licence, retrieved, tier) as rows; UNKNOWN with a reason where the pack gives nothing; `sheetSummary` counts what is recorded and is not a rating |
| `placeSheetExport.ts` | vCard 3.0 contact cards and GPX 1.1 waypoints; escaping, 75-octet folding, control-character removal |
| `PlaceSheet.tsx` | "Details and gaps" disclosure on each place card |
| `ShortlistFiles.tsx` | save the listed places as `.vcf` or `.gpx` |
| `gapMatrix.ts`, `gapMatrixExport.ts`, `GapMatrix.tsx` | the listed places against the nine details, with CSV export (two places or more) |
| `placeFixtures.ts` | test builders only |

## Rules kept

- Unknown data is the token `UNKNOWN` in both languages, with a stated reason in the sheet.
- A place with no map point has no waypoint, no `GEO` line and no map link: a position is never guessed.
- The note in each file says it reports what the pack says and is not a check of the place.
- The count of details is a count, not a score. The grid keeps the list's own order.
- GPX files carry the credit exactly as `© OpenStreetMap contributors`.
- No new storage key, no network request.

## Not covered

- Files are tested as text, with stand-ins for the browser's save; no phone or navigation app was used to open them.
- Screen readers were not run; checks are axe-core and simulated keyboard events.
