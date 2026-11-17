# Fail-safe data on the device

Sources fail: files arrive truncated, a build writes a bad line, a network drops halfway. This cannot be prevented. What `packages/data-client` guarantees is that one bad unit fails alone, is counted, and is never shown to a person as a fact, and that the last verified copy on the device stays until a newer one has passed every check.

The import and pack side of the same guarantee is in access-maps `docs/failsafe.md`.

## Guarantees

1. Every part is checked before it is stored: byte size, SHA-256 from the manifest, decompression, and item count (kept plus dropped must equal the manifest count). A part whose size or hash does not match is fetched once more with `cache: "no-store"`; if it still does not match, nothing from it is stored.
2. Every record is checked with `checkPackRecord` before it is stored and again before `records()` yields it: an id, a known tranche, a region, and on every field a value, a source id listed as in the web pack, a licence, a date and a tier from 0 to 4. A known latitude and longitude must both be numbers inside a box around Ontario. A record that fails is dropped and counted in `RegionStatus.droppedRecords`. It is never rendered.
3. One bad line or record does not reject its part. One bad search entry does not reject the search index.
4. A cell is written to IndexedDB in one transaction, after all its parts pass. A failed cell leaves every other cell, and every earlier copy of itself, as it was.
5. When a rebuilt pack lists a new hash for a part path and that part is not on the device yet, `records()` shows the last verified copy of the same path. The cell is listed in `RegionStatus.staleCells`. A source the new manifest holds back is not shown from an old copy.
6. A part the pack builder withheld is listed in `RegionStatus.unavailable` with the builder's reason, unless an older verified copy can stand in (then the cell is in `staleCells`).

## Not guaranteed

- That the data is complete or current. A stale cell is the last verified copy, not today's data.
- That a part which never decompresses can be partly used. It fails as a whole after its hash check.
- That a cell with one failed part shows its other parts (see `docs/failsafe-audit.md`).

## Where the app shows these states

The data client exports everything needed. The `/offline` page (`apps/web/src/offline/RegionPackPage.tsx`, `RegionFailsafeNotes`) shows, for each region, in English and French:

- each cell in `status.unavailable` as "Unavailable", with the reason the pack builder recorded (two withheld parts in one cell read as one cell with both reasons);
- the cells in `status.staleCells`, under a note that the last checked copy saved on the device is shown for them;
- `status.droppedRecords > 0` as "N records failed the checks on this device and are not shown".

The notes sit in one `role="status"` container per region, so a change after a download or a check is announced. Strings are in `apps/web/src/offline/catalog.ts`. Tests: `RegionPackPage.dom.test.tsx` (both languages, axe) and `apps/web/e2e/offline-robust.spec.ts` (a served fixture pack with a withheld part, a record without a licence and a rebuilt cell; both languages, axe).

Map and list screens that call `records()` need no change: dropped records are never yielded.

## Reading the counters

- `droppedRecords`: records and search entries on the device that failed the device check. They came from a part with a correct hash, so the pack builder wrote them; report the region and build date to the data maintainers.
- `staleCells`: cells shown from an older build. Downloading the region again replaces them once the new parts verify.
- `unavailable`: parts the builder left out of this build, with the reason the builder recorded.

## Tests

`npm run check:failsafe -w @access-main/data-client` runs `packages/data-client/src/failsafe.test.ts`. `npm test` at the root runs it too, through the workspace tests, so CI runs it on every pull request.
