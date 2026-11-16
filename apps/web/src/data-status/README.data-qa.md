# Data QA panel (data-status round 3)

What it does, in plain terms:

- `auditRegistry(records, now)` checks each dataset and each source for a recorded source, an open licence and a retrieved date, and for stale or future dates. Staleness uses a per-kind threshold (`freshnessPolicy.ts`, overridable). Gaps are reported, never filled in: a missing date stays Unknown, never "fresh"; a missing licence stays Unknown, never "open".
- `coverageTable()` counts yes / no / unknown per attribute. Unknown is its own column and is never folded into "No". Shares with nothing to divide show Unknown, not 0.
- `buildQaReport()` / `renderQaReportHtml()` turn the audit into a short EN or FR list of items to review. The empty-state text says only that nothing was found in the data provided.
- `snapshot.ts` keeps an offline saved copy in browser storage. The checksum detects accidental corruption only. If live data cannot be loaded, the panel shows the saved copy with its date, or says there is none.
- `csv.ts` exports the source list (licence and retrieved date per source) with a spreadsheet-formula guard and a UTF-8 BOM for accents.
- `a11y.ts` holds the badge palette and WCAG contrast checks (text 4.5:1, borders 3:1). Status is always text as well as colour. Buttons and links are at least 44 by 44 px.
- `i18n.ts` holds all EN and FR strings and a French typography linter (’, U+00A0 before `:`, U+202F before `; ! ?` and inside « »). The test suite lints the whole FR catalog, so a bad string fails the run.

## Integration

`mountDataStatusPanel(host, options)` is the entry point for an app shell. It is exported from `index.ts` and is not mounted on any route by this change (the router lives outside this folder). Minimal use:

```ts
import { createSnapshotStore, mountDataStatusPanel } from './data-status';

mountDataStatusPanel(document.getElementById('data-status')!, {
  getRecords: () => registryRecords,       // DatasetRecord[] you load
  getLocale: () => (document.documentElement.lang === 'fr' ? 'fr' : 'en'),
  store: createSnapshotStore(globalThis.localStorage),
  onExport: (csv, filename) => { /* offer a download */ },
});
```

Every record shown must carry its own source, licence (open licences only) and retrieved date; this folder displays them and does not supply them.

Run the tests: `npx vitest run apps/web/src/data-status`

## Performance: kept out of the initial bundle

This folder is imported statically only by `pages/DataStatusPage.tsx`, which the
router loads on demand (`perf/routeChunks.ts`). `initialBundle.test.ts` fails if
any other source file imports it statically, if `DataStatusPage` is imported
statically, or if a module here touches `window`/`document` at load. It reads
source text; bundle bytes and the LCP / first-result gates are measured by
`npm run build` and `e2e/perf.spec.ts`, whose thresholds are unchanged.
