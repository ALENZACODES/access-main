# Source list (data-status round 2)

`buildSourceList(sources, locale, now)` returns one row per source (sorted by name) with licence, whether the licence is on the open list, retrieved date, freshness and issues. Missing values show Unknown/Inconnue; unsafe (non-http/https) URLs are dropped; duplicate ids are flagged. `renderSourceListHtml(rows, locale)` renders an escaped, semantic table (caption, column and row headers, `<time>`, text status, 44px link targets). Both are exported from `index.ts`, which also re-exports `dataStatus.ts`.

On the live Data status page (`pages/DataStatusPage.tsx`) the cached records are grouped by source and licence, and each row shows the oldest retrieval date in that group (Unknown if any record has none), so stale data is not hidden. Accepted provider terms (Metrolinx Access and Use Agreement, LTC Open Data Terms of Use) are not flagged for review; only a licence on neither the open list nor the accepted-terms list is.
