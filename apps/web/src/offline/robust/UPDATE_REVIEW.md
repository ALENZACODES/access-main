# Device-local offline copy review

The existing `/offline` shell mounts the storage-pressure dashboard. That
same dashboard mounts `mountOfflineUpdateReview`, so no new route, source of
truth, third-party tile service or scheduled work is introduced. The review
is initially collapsed. A person chooses whether to open it and can refresh
the existing dashboard explicitly.

## Information model

`assessOfflineRegion` compares the region's declared list against the local
inventory read by the dashboard. A matching saved record is described as
saved offline, not as evidence about a place's physical accessibility.
Absent, stale, unreadable, unlisted or inconsistent records are **UNKNOWN**.
An unavailable inventory, mismatched region, duplicate identifier or invalid
manifest is fail-closed: nothing is presumed saved.

The review can search or filter the listed cells by ID, source, licence or
date, sort by size, ID or status and page through the results. Each visible
cell retains its exact source, open licence and publication date; no date
is inferred for an unlisted record. The device's storage estimate is advisory
and never changes a cell status. A suggested recovery queue is empty when
source integrity or readability is UNKNOWN. The host retains authority over
all actual downloads, including quota and content checks.

## Explicit reports

The two export controls create text or JSON records only on user activation.
They contain listed metadata, device observations and UNKNOWN states, not
payload bytes, location histories, device identifiers or usage data. Text
fields are sanitized for control characters and Unicode direction overrides;
filenames are normalized and length-limited. Neither action posts a report to
a server. No automatic retry, deletion or background processing is added.

## Accessibility and localization

All controls have visible labels and at least 44 CSS pixel targets. Search
and selections use native HTML controls. The status region announces changes
without moving keyboard focus. English and French strings come from one
catalogue; French typography uses typographic apostrophes and required
nonbreaking punctuation spaces. Tests fail on missing translations or
unsupported claims. This work does not assert blanket conformance.

## Checks

Run all repository checks from a clean checkout after dependency installation:

- `npm run lint`
- `npm run typecheck`
- `npm test`

Focused tests: `updateAssessment.test.ts`, `updateCopy.test.ts`,
`updateReviewExport.test.ts`, and `updateReviewPanel.test.ts`.
