# @access-main/advocacy

First slice of Major Idea 8 (issue #17): on-device aggregation, small-community suppression, and a campaign evidence-pack export, with a small English and French review screen.

This slice works from labelled demonstration observations that the package defines in `src/demo.ts`. They are synthetic, carry `example: true`, and are never headline counts. The typed input interface is `Observation` in `src/types.ts`; a later slice can feed real records through it. Nothing here connects to any outage or parking pipeline.

## What it does

- `schemas.ts` and `validate.ts`: JSON Schema 2020-12 documents and Ajv validators for an observation, an aggregate cell, and an evidence pack. Unknown is a value (`"UNKNOWN"`). No personal fields are accepted, and a key scan rejects them by name.
- `engine.ts`: groups observations by category, coarse area, and period, then decides per cell. A known count below `k` (default 5) is suppressed. A cell in a small community, or one of unknown size, is suppressed below `k × 4`. Suppressed cells carry no count at all. Nothing is rounded.
- `pack.ts`: builds the pack. It states methodology, the as-of date, the suppression rules, and that headline eligibility follows `packages/schema/docs/counting-rules.md`. It never prints a total across cells or a province-wide total.
- `ui/`: review screen listing published, suppressed, and unknown cells, with an "Export pack" action. Strings live in `i18n/`.

`k` cannot be set below 3, and the cell schema refuses a published count below 3.

## Consented reports (`src/reports/`)

The second slice starts from single structured reports (barriers, parking, coverage, housing waits) instead of ready-made counts. Everything runs on the device. Its demonstration inputs are in `src/reports/demo.ts`; they are synthetic and marked `example: true`.

- `types.ts`, `schemas.ts`, `validate.ts`: a report holds a kind, a topic from a fixed list, a region code, a month, an input-set id and a consent reference. The schema is closed: no free text, no day or time, no position, no extra field. A region code shaped like a postal code, a long number or a coordinate is refused.
- `coarsen.ts`: `monthOf` reduces a date or a date and time to `YYYY-MM`; `periodKey` groups months into quarters or years.
- `consent.ts`: a report counts only if the ledger holds exactly one entry for its reference, with the status `granted`, for the required purpose and version. The status words are the ones `packages/consent` uses; this package does not import it.
- `regions.ts`, `tables.ts`: one table per kind and period, regions by topics, with row, column and table totals.
  - A table with fewer reports than the minimum cell size (default 5, never below 3) is withheld whole.
  - A region with a small or unknown population is never a row. Its parent region is shown as one row covering every region inside it. This follows the region table only, so the shape of a table does not show whether a small community reported.
  - A row whose total is still below the minimum pulls its whole parent into one row; at the top, all regions become one row.
  - A topic whose total is below the minimum is folded into one combined column with every empty topic and the smallest remaining topic.
- `disclosure.ts`: primary suppression of counts from 1 to minimum − 1, then complementary suppression. After it, for every suppressed cell, the values that fit the published cells and totals span at least the minimum. The check is exact for a reader who knows the published numbers and that counts are whole and not negative (two maximum-flow searches per cell).
- `pack.ts`: `buildReportEvidencePack` returns either a pack with five files (JSON, a tables CSV, a provenance CSV, and a read-me in English and in French) or a refusal. It refuses when any consent record is missing, revoked, refused, out of date, for another purpose, or ambiguous, and when any input is invalid. The pack states methodology, the rules applied, counts of what was suppressed, source, licence, date and tier for each input set, and the limits (“These are reports, not a census”, “The reports are not verified”). The as-of date is supplied, inputs are sorted, and a fingerprint covers the content, so the same input gives the same bytes.
- `kpi.ts`: indicator definitions as data (`input`, `output`, `outcome`). Values come only from records: built packs, logged deliveries, logged citations and completed incident reviews. With no records the result is `no_data`. A definition cannot carry a baseline or a target; the validator refuses extra fields. Report counts are read from the published tables of the latest pack, never from raw reports.
- `ui/ReportsPanel.tsx`: the tables, the limits, the rules, provenance, the indicators and an export action, in English and French.

### What the tests show, and what they do not

`disclosure.test.ts` and `tables.test.ts` run seeded random tables and region trees against an independent reader (`attackerRanges` in `test-helpers.ts`) that tries every value for every suppressed cell. They show that no published number lies between 1 and minimum − 1 and that no suppressed cell can be narrowed to a span below the minimum from the cells and totals of its table.

They do not cover a reader with outside knowledge of a community, two packs built from the same reports with different settings or at different times (for example before and after a consent is revoked), or reasoning about which cells the rules chose to suppress. The pack says so under Limits.

Not built here: campaign workspaces and approved evidence specifications, any link to the stores of other packages, and indicators beyond the three success measures named for this work.

## Commands

```
npm run typecheck -w @access-main/advocacy
npm test -w @access-main/advocacy
npm run test:e2e -w @access-main/advocacy   # Playwright + axe-core, EN and FR at 1280 and 320; report tables and export
npm run dev -w @access-main/advocacy
```
