# @access-main/advocacy

First slice of Major Idea 8 (issue #17): on-device aggregation, small-community suppression, and a campaign evidence-pack export, with a small English and French review screen.

This slice works from labelled demonstration observations that the package defines in `src/demo.ts`. They are synthetic, carry `example: true`, and are never headline counts. The typed input interface is `Observation` in `src/types.ts`; a later slice can feed real records through it. Nothing here connects to any outage or parking pipeline.

## What it does

- `schemas.ts` and `validate.ts`: JSON Schema 2020-12 documents and Ajv validators for an observation, an aggregate cell, and an evidence pack. Unknown is a value (`"UNKNOWN"`). No personal fields are accepted, and a key scan rejects them by name.
- `engine.ts`: groups observations by category, coarse area, and period, then decides per cell. A known count below `k` (default 5) is suppressed. A cell in a small community, or one of unknown size, is suppressed below `k × 4`. Suppressed cells carry no count at all. Nothing is rounded.
- `pack.ts`: builds the pack. It states methodology, the as-of date, the suppression rules, and that headline eligibility follows `packages/schema/docs/counting-rules.md`. It never prints a total across cells or a province-wide total.
- `ui/`: review screen listing published, suppressed, and unknown cells, with an "Export pack" action. Strings live in `i18n/`.

`k` cannot be set below 3, and the cell schema refuses a published count below 3.

## Commands

```
npm run typecheck -w @access-main/advocacy
npm test -w @access-main/advocacy
npm run test:e2e -w @access-main/advocacy   # Playwright + axe-core, EN and FR at 1280 and 320
npm run dev -w @access-main/advocacy
```
