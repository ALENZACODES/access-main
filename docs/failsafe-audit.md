# Fail-safe audit: one bad unit of data on the device

Date: 2026-11-16. Package: `packages/data-client`, access-main main at `e6591fc`.

The import, validation, pack and tile steps are audited in access-maps `docs/failsafe-audit.md`. This file covers the steps on the device: app download, integrity check, IndexedDB and render.

"Before" is what a probe observed when it ran against `packages/data-client` on main, not what the code appeared to do. The probe built one pack cell in memory (one record part and one search part), served it through a fake `fetch`, called `downloadCell`, and listed what `records()` then returned. Each run had one bad unit between two good records `a` and `b`.

| # | Fault (one unit) | Before (observed) | After (this branch) | Test (`packages/data-client/src/failsafe.test.ts`) |
|---|---|---|---|---|
| 1 | Malformed JSON line inside a part whose hash is correct | Whole cell rejected (`content`); nothing shown for the cell | Line dropped and counted (`droppedRecords`); `a`, `b` shown | "malformed JSON line" |
| 2 | Record with an unknown tranche | Whole cell rejected; nothing shown | Record dropped and counted; others shown | "unknown tranche" |
| 3 | Field without `source_id`, `licence`, date | Record stored and rendered. Leaks without provenance. | Dropped, never yielded | "missing provenance", "missing licence" |
| 4 | Unknown enum: tier 9 | Rendered | Dropped | "unknown enum: tier 9" |
| 5 | Out-of-range coordinate (lat 4370) | Rendered | Dropped | "out-of-range coordinate" |
| 6 | Wrong type: latitude `"43.7"` | Rendered | Dropped | "wrong type" |
| 7 | Field from a source the manifest does not list (no licence to show) | Rendered | Dropped | "source the manifest does not list" |
| 8 | Search entry with a bad coordinate or no name field | Whole search part rejected | Entry dropped and counted; the rest of the index works | "a bad search entry" |
| 9 | Part with the wrong hash once (transient) | Cell rejected (`sha256`) | Fetched once more without the HTTP cache; the good copy is used | "is fetched again once" |
| 10 | Part with the wrong hash every time | Cell rejected; nothing stored | Same: rejected after the second try; nothing stored; cell listed in `missingCells` | "is never stored when the second copy also fails" |
| 11 | Rebuilt pack (new hash for the same path) and the new part fails | Region showed nothing, before and after the failed refresh, although a verified copy was in IndexedDB | The verified copy keeps being shown; `staleCells` lists the cell | "a rebuilt pack whose new part fails" |
| 12 | Part withheld by the pack builder | No such signal existed | With a stored copy: that copy is shown, cell in `staleCells`. Without: the part is listed in `RegionStatus.unavailable` with the builder's reason | "a part the builder withheld" |
| 13 | HTTP error mid-download of one cell | Cell rejected, earlier cells kept (already true on main) | Unchanged | existing `index.test.ts` "downloads one cell at a time" |
| 14 | Manifest response is malformed JSON | Saved manifest used (already true on main) | Unchanged | "falls back to the saved manifest" |

## Not contained on the device

- A part that does not decompress, or a search index that is not a JSON array, still fails as a whole. Its hash is checked first, so this only happens when the pack builder wrote a broken file; the builder now withholds such parts (access-maps pack follow-up).
- A cell is still committed all or nothing (`downloadCell`). If one part of a cell fails twice, the other parts of that cell are not stored either. This is kept on purpose: the region page shows a missing cell as not downloaded, while storing some parts of a cell would show, for example, venues without washrooms and let a person read the gap as "no washroom here".
- The app shell does not read `staleCells`, `droppedRecords` or `unavailable` yet. Until it does, a withheld part with no stored copy looks the same as a cell with no data. See "Wiring for the integration lane" in `docs/failsafe.md`.
