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

## Dates, unknown values and cross-surface consistency (round H)

- **Dates** (`dateRules.ts`): only real calendar dates are read. `2026-02-31` is invalid, not March 3. A date-time must carry its own offset (`Z` or `±hh:mm`); one without it is invalid because its meaning would depend on the machine. Ages are whole calendar days (UTC). A record is stale only when its age is **more than** the limit.
- **Future dates** stay Unknown and always carry the `future-date` issue, so the status and the issue list never disagree.
- **Placeholders** (`unknownTokens.ts`): `N/A`, `TBD`, `unknown`, `inconnu`, `non disponible`, `-`, `?` and similar count as missing for the source, licence and date. Real text that merely contains such a word is kept.
- **Status basis** (`statusBasis.ts`): every non-fresh status states its reason, with the retrieved date, the age and the limit for the dataset type. Shown in the page section "How statuses are decided".
- **Completeness** (`completeness.ts`): UNKNOWN rate per field, overall and per dataset, on the page and at `/{locale}/data-status/completeness.json`. With nothing to measure the rate is `null`, never 0.
- **Consistency** (`consistency.ts`, `invariants.ts`): one registry is rendered as the audit, summary, CSV, catalogue, source list, review queue, calendar, QA counts, completeness and credits, and the results are compared. `/{locale}/data-status/consistency.json` reports `consistent` and any problems. `invariants.ts` lists the rules a status must obey (for example: fresh needs an age within the limit; unknown names exactly one date issue; a licence status needs a recorded licence).
- **Untranslated copy** (`untranslated.ts`): French messages identical to English, English marker words inside French text, and unfilled `{placeholders}`. The marker list leaves out words spelled the same in both languages.
- **Fresh label**: "Within the update limit" / "Dans le délai de mise à jour". The old "Recently updated" overclaimed for records up to 180 days (730 for boundaries) old.
- `fuzzKit.ts` generates seeded messy registries for tests only. A failing seed can be replayed.
