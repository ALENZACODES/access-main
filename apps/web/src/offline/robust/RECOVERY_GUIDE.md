# Offline recovery guide — P12

The public `/offline` page mounts this guide through `offlineDashboard.ts`.
The panel uses `DashboardModel` and the existing local inventory. It does not
fetch any new records during ordinary rendering. There are no new endpoints,
automated downloads, scheduled tasks, telemetry or third-party tile sources.

## Read-only checks

`buildRecoveryPlan` compares each listed cell ID, expected byte size, source,
open licence and source date with the locally inspected inventory. A current,
matching saved copy can be shown as saved; a missing or stale copy remains
`UNKNOWN` until a later inventory reading observes the new stored data.

Unlisted, duplicated, invalid, contradictory and unreadable records fail closed.
If an inventory is unavailable or belongs to another region, no retry candidates
are offered. An absent or inconsistent storage estimate is `UNKNOWN`, not zero
or an assumption of sufficient free space.

Storage calculations reserve 1 MiB by default; this margin is a planning aid,
not a promise that a future write will succeed. Each manual request checks the
current inventory and capacity again before calling `downloadSelected`.

## Interaction

A person opens the guide explicitly, reviews the read-only status, then chooses
up to 200 individually listed missing or stale cells. A retry is only possible
when inventory evidence and estimated headroom permit it. Pressing the manual
retry button is the only path that invokes a download through this panel.

Searching, sorting, filtering, and pagination operate only on identifiers and
metadata. Native inputs and buttons have minimum 44 CSS pixel targets.
The panel has a polite status region, visible labels and a cleanup function.
A checkbox selection does not replace the focused element.

English and French are supplied for all authored user-facing labels. French
colon spacing uses U+00A0 and high punctuation uses U+202F. The literal
`UNKNOWN` is intentionally unchanged in both languages. The guide makes no
claims about the physical accessibility of any place.

## Local exports

Text and JSON reports are made only on an explicit save action. They record
cell status, reason, size, source, open licence, source date and the `UNKNOWN`
evidence tier. No downloaded bytes or personal information are included.
The report date is supplied by the calling panel. File names are bounded and
cannot include directory traversal paths.

## Source and test boundaries

The implementation imports existing source contracts from `regionDownload`,
`regionInventory`, `manifestAudit`, `accessibilityGuard` and `offlineDashboard`.
These files must be retained from the exact main commit; the ZIP includes only
the two integration edits and the new guide files.

Tests include failed local inventory, duplicate identifiers, contradictory
provenance, invalid licences, invalid dates, quota arithmetic, reserve margins,
manual selection rules, local exports and bilingual copy. The wiring test
fails if the barrel export, live mount or unmount cleanup is removed.

Run `npm run lint`, `npm run typecheck`, and `npm test` at the repository root
on a clean checkout with dependencies installed. Offline functional tests can
also be selected with `npx vitest run apps/web/src/offline/robust/recoveryGuide*.test.ts`.
