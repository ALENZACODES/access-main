# Source list (data-status round 2)

`buildSourceList(sources, locale, now)` returns one row per source (sorted by name) with licence, whether the licence is on the open list, retrieved date, freshness and issues. Missing values show Unknown/Inconnue; unsafe (non-http/https) URLs are dropped; duplicate ids are flagged. `renderSourceListHtml(rows, locale)` renders an escaped, semantic table (caption, column and row headers, `<time>`, text status, 44px link targets). Both are exported from `index.ts`, which also re-exports `dataStatus.ts`.
