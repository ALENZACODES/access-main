# Offline storage scenario planning

The existing `/offline` dashboard now mounts `mountStorageScenarioPanel`, a
read-only what-if planning tool. It uses the current region manifest and local
inventory, plus an optional user-requested browser storage estimate. It does
not download cells, delete saved copies, modify quotas, request persistence,
contact a service, or run scheduled tasks.

## Model

The planner protects a configurable free-space reserve, adds a configurable
per-cell overhead allowance, and groups proposed cells by exactly matching
source, open licence and source date. The group size is bounded. A low estimate
is advisory: it does not establish how much storage a future download will use.

Only cells whose current manifest and local inventory both identify a missing
or stale copy can be proposed. Unreadable cells, contradictory metadata,
duplicate entries, unlisted cells and incomplete inventories remain UNKNOWN.
The proposed batch IDs must not be treated as proof of successful writes.
Device availability never establishes accessibility of a location.

The report contains listed cell IDs, sizes, source, open licence, date, and an
explicit UNKNOWN documentation tier. It contains no cell payload, personal
identifier, query text, remote endpoint, or raw browser state. Report generation
is local and user-initiated.

## Accessibility

Native labelled inputs, selects and buttons have minimum 44 CSS-pixel targets.
An `aria-live` status reports an unavailable or uncertain estimate. Both English
and French strings are provided; French colon and punctuation spacing is
checked in tests. UNKNOWN is spelled identically in both languages.

## Regression tests

- `storageScenario.test.ts`: conservative capacity and manifest/inventory rules
- `storageScenarioCopy.test.ts`: bilingual status and punctuation
- `storageScenarioExport.test.ts`: metadata-only, safe local reports
- `storageScenarioWiring.test.ts`: mounted dashboard and existing workspaces

Use `npm run lint`, `npm run typecheck`, and `npm test` from a checkout of the
current repository with dependencies installed. Tests are not a substitute for
browser accessibility review or a device's actual quota behaviour.
