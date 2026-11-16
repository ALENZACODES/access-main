# Offline robustness — integration on main

The existing `/offline` route in `RegionPackPage.tsx` calls
`mountStoragePressurePanel` through `robust/index.ts`, which mounts
`mountOfflineDashboard`. Its pack download and provenance ledger remain
the authoritative sources of offline cell availability.

This folder adds manifest metadata checks, optional device-local text/JSON
reports, searchable recovery selection, and explicit cleanup review. No
background jobs, automatic retries or third-party tiles are introduced.

Each cell records source, open licence, date and expected byte count. A
missing, stale or unreadable cell remains unavailable; a failed lookup is
UNKNOWN. Offline copies never establish physical accessibility. The UI
provides English and French copy, keyboard-operable native controls, polite
status announcements, and 44-pixel minimum action targets.

`firstPartyFetch.ts` and `indexedCellStore.ts` are separate low-level
utilities. The IndexedDB store records metadata, not downloaded pack
payloads; it must not substitute for the existing pack client's storage.
All downloads and removals must be initiated by the user.

## Checks

From repo root, after `npm ci`:

- `npm run lint`
- `npm run typecheck`
- `npm test`

The tests cover source/licence checks, download failures, missing-cell
reporting, recovery selection, cleanup confirmation and bilingual copy.
