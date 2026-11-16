# Offline region robustness

`regionDownload.ts` provides quota-aware, resumable downloads of explicit
region cells. It adds no endpoints, tile servers, background tasks or automatic
network requests.

Each manifest cell includes its expected byte count and source, open licence,
and date. A cell is available offline only after its complete bytes are stored
atomically and the metadata matches the current manifest. Missing, unlisted,
stale, and failed cells remain UNKNOWN. **Offline availability does not establish
physical accessibility.**

Pass a first-party `fetchCell`, atomic `CellStore`, and storage estimator to
`downloadRegion`. For browser storage, the host may use
`navigator.storage.estimate()`. If available free space cannot be verified or
falls below the cell size plus a 1 MiB reserve, the function stops without
fetching that cell. Re-running resumes from committed cells; an incomplete
region is reported with both `available` and `missing` cell IDs. The host must
serialize downloads per region and check dataset licences before inclusion.

Use `OFFLINE_STRINGS[language]` for English/French status labels. Any host UI
must provide visible keyboard focus, screen-reader status announcements and
interactive targets of at least 44 × 44 CSS pixels (WCAG 2.2 AA).

Test with the repository's Vitest runner:

`vitest run apps/web/src/offline/robust/regionDownload.test.ts`

## Manual recovery workspace

The mounted offline dashboard now includes `mountOfflineTriage`: searchable,
filterable and sortable views of locally listed cells, with per-cell source,
licence, publication date and expected size. Missing, stale and unreadable
copies keep an UNKNOWN offline status. The controls do not interpret the
accessibility of a physical location.

A person can select up to 500 UNKNOWN cells, request only those cells, or
select a smallest-first batch from the browser's estimated free storage after
the reserved margin. Estimates are advisory: writes are still checked by the
existing quota-aware downloader. Selection never triggers a request by itself,
and a concurrent full-region download and selected download are serialised.
The selection is reconciled after each inventory refresh so that saved or
removed cells cannot remain selected.

The **Export recovery list** button saves a local text report with selected
UNKNOWN IDs, reasons, sizes, sources, open licences and source dates. It does
not export stored bytes, browser identifiers, the user's search, or personal
information. The report and controls support English and French. Native
labelled buttons, search input, selects and checkboxes retain keyboard access;
all action targets are at least 44 CSS pixels. There is no periodic task,
third-party tile service, external export endpoint or background retry.

Relevant tests: `cellTriage.test.ts`, `triageBudget.test.ts`,
`triageCopy.test.ts`, `triageExport.test.ts`, and
`offlineTriageModel.test.ts`.

## Device-local cleanup (next round)

The mounted offline dashboard now includes `mountOfflineCleanup` when the
first-party cell store offers explicit record removal. The control is absent
from unsupported storage backends. It does not delete automatically.

- Search, filter and sort only cells in the current listed region.
- The person selects individual stored copies, with a 250-cell selection cap.
- Missing cells are not offered for removal; stale and unreadable ones remain
  UNKNOWN and are not silently presented as saved.
- A separate review step shows the selected identifiers, source, open licence,
  publication date and listed byte count. This is not a free-space prediction.
- The confirmation button starts removal. Each cell is re-read before deleting;
  a changed record stops the batch. The result separately names deleted and
  retained copies, including partial results and interruptions.
- There is no background deletion, remote tracking, location lookup, or
  third-party tile request. Removing a stored copy does not establish facts
  about physical accessibility, and missing offline copies remain UNKNOWN.
- Both languages use native labelled controls with 44-pixel minimum targets,
  visible focus, status announcements and source/licence/date details.

Run the cleanup tests using the repository's Vitest runner. The strict source
check can run without a DOM test environment:

`tsc --noEmit --strict --lib ES2022,DOM --target es2022 --moduleResolution bundler --module esnext apps/web/src/offline/robust/index.ts`

After an attempted removal, the panel also offers an explicitly requested,
local-only UTF-8 text report. It contains only listed cell IDs, source, open
licence, date, listed bytes and the resulting offline state. Receipts with an
unavailable post-action inventory are not exported; no space-saved claim is
made. The person controls whether to save the report.
