# Device-local source ledger

Mounted through `offlineDashboard.ts` on the existing `/offline` route. The
panel reuses the dashboard's inventory and never fetches a new network
endpoint, writes to storage, or schedules a background operation.

Each declared cell displays an ID, expected bytes, source, open licence,
source date, local status and an explicitly recorded evidence tier. The host
may pass `SourceTierRecord` entries when it has a source-specific description
of the tier and exact matching source/licence/date. Until then the tier stays
UNKNOWN, even when the device has saved a matching cell. Tier records never
establish that a place is accessible and never change the offline status.

Unknown or unreadable local inventory, unsupported licences, invalid dates,
source mismatches, duplicate entries and unlisted cells are not silently
accepted. The metadata-only export is user-initiated and contains no pack
payload bytes. Filtering and pagination work locally. English and French
labels are paired, native controls have a minimum 44 CSS pixel target, and a
polite live region announces the current ledger status.

Tests: `sourceLedger.test.ts`, `sourceLedgerCopy.test.ts`.

Existing modules reused from current main:
`regionDownload.ts`, `regionInventory.ts`, `manifestAudit.ts`,
`accessibilityGuard.ts`, and `offlineDashboard.ts`.

The source ledger and transfer checklist are mounted side by side from the
current-main dashboard component. Both are exported through `robust/index.ts`.
The status token `UNKNOWN` remains identical in English and French; surrounding
French explanations are translated. Neither panel starts a download itself.
