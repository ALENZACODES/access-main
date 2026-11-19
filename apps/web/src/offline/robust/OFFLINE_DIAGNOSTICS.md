# Offline copy diagnostics

The live `/offline` dashboard mounts `mountOfflineDiagnostics` beside the
existing source, cleanup, and recovery controls. The panel only reads the
current dashboard inventory and manifest. No background work, third-party
map tile requests, or automatic downloads are introduced.

Cells are marked `saved` only when the inventory contains a matching record
with a matching source, licence, date, listed byte count, and `present` cause.
A missing, stale, unreadable, unlisted, invalid, or contradictory record stays
`UNKNOWN`. Unknown documentation tier is always the literal `UNKNOWN`.
A saved offline copy is not evidence of physical accessibility.

Open licences are drawn from the existing `OPEN_LICENCES` list. Dates must be
canonical calendar dates. Duplicate identifiers and invalid source metadata
fail closed. The browser storage estimate is advisory, not a promise of
capacity or a completed future download.

The bilingual panel uses native search, select, and button controls with at
least 44 CSS pixels of target height and width, native keyboard semantics,
visible control text, and a polite status announcement. It paginates cells
instead of mounting an unbounded list. The export button saves only the listed
metadata and diagnostic statuses; it never includes downloaded payloads.

Run the repository's standard `npm run lint`, `npm run typecheck`, and
`npm test` checks after applying the complete files. The targeted Vitest files
are `offlineDiagnostics.test.ts`, `offlineDiagnosticsCopy.test.ts`, and
`offlineDiagnosticsWiring.test.ts`.
