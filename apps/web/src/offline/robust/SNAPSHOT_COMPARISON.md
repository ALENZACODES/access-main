# Three-way offline region snapshot comparison

This user-directed tool compares the current region manifest with up to two manually supplied JSON snapshots. It is a review of **declared data provenance**, not a physical accessibility assessment and not a data download. The public-facing name is always the App.

## Workflow

1. Open the regular offline dashboard for a listed region.
2. Select **Open snapshot comparison** to request the optional JavaScript module. The panel is not mounted or fetched until that deliberate click.
3. Select **Export current snapshot JSON** to save a valid source listing for future comparison. This is an explicit download, not an automatic save.
4. Paste either or both comparison snapshots in the text fields. A snapshot uses `offline-region-snapshot-v1` with a region ID, user-chosen label, source date, and a list of cells.
5. Select **Compare snapshots**. Both JSON inputs are completely parsed and validated before a comparison replaces the previous results. An invalid input leaves the current result unchanged.
6. Review added, removed, provenance-changed, and declared-size-changed cells. A missing comparison option remains `UNKNOWN`; it is not represented as a zero-sized or empty pack.
7. Review the **saved metadata match** separately. A local cell is marked `saved` only when inventory status, cause, declared size, source name, licence, and source date all match the baseline manifest. Otherwise it is `UNKNOWN`.
8. Search, filter, sort, and page through the results, then explicitly export a metadata-only text or JSON report if desired.
9. Close the panel to remove subscriptions, event listeners, and its DOM nodes.

## Integrity and privacy constraints

The parser rejects unknown schema fields, unexpected metadata attributes, duplicate cell IDs, malformed dates, source dates after snapshot dates, negative or fractional byte counts, invalid region names, control characters, unsafe total sizes, more than 1,024 cells per snapshot, or JSON exceeding 192 KiB. The comparison accepts only snapshots for the same region.

The report does not contain the underlying data bytes, locations, browser identifiers, medical data, account details, or a claim that a place is physically accessible. A person may paste identifiable information into a source label; the UI reminds them to inspect any export before sharing.

No network operations are launched by the data model, export functions, or panel. The feature never removes, commits, redownloads, or modifies stored pack bytes. It never changes a cell's physical access value from `UNKNOWN`.

## Languages and accessibility

All UI text has English and French variants. French copy uses typographic apostrophes, nonbreaking spaces before colons, and narrow nonbreaking spaces before question and other required punctuation. Status updates use `role="status"` and `aria-live="polite"`. All interactive controls use a minimum of 44 CSS pixels and native input elements. Untrusted source labels are inserted with `textContent`, not HTML.

## Integration and install budget

The new panel is dynamically imported from an explicit click in `offlineDashboard.ts`; it is deliberately not exported as a runtime value from `robust/index.ts`. The dashboard's existing preparation, inquiry, contingency, continuity, handoff, timeline, workbook, casebook, recovery, and other mounts and cleanup remain intact.

The service worker precaches the comparison chunk during installation. A user can open the comparison offline even on its first use. The emitted JavaScript counts toward the 5,242,880-byte first-install budget and the 524,288-byte per-entry cap.

## Tests

`snapshotComparison.test.ts` covers strict parser boundaries, source-date and licence integrity, local observation classification, regional identity, option absence, changes, pagination, sorting, nonmutation, and calendar dates. The copy suite tests translated keys and required caution. The export suite tests deterministic metadata-only output and sanitization. The wiring suite checks explicit lazy loading, teardown and preservation of earlier mounts.
