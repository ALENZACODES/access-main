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
