# Local source reconciliation

The recovery shell mounts `RecoveryProvenanceLedger` beside the existing recovery panels. It is a user-controlled notebook for comparing contradictory statements about pack metadata and field claims. It does not alter downloaded data, establish physical accessibility, or mark an UNKNOWN pack ready.

Each statement has an identifier, pack ID, field key, reported value (including the literal `UNKNOWN`), immutable note, recording time, review state, source name, open licence, source date, evidence tier, and optional reference. A source statement is a claim, not an endorsement. A disputed or UNKNOWN group is never promoted to a single uncontested conclusion.

The editor is disabled until a local inventory inspection has completed. Users may mark draft statements reviewed or disputed, filter by pack, value or review phase, and inspect field conflicts. No background network requests, storage writes, or automatic pack operations are performed.

JSON export is an explicit user action supplied by the host callback. Import is bounded by byte length and entry count, rejects unexpected fields, and displays a preview. Identical IDs with different histories block the entire merge. The preview never applies changes by itself. Source dates and licences must be supplied; the App does not invent them. No personal location or device ID is collected.

For tests, run `vitest run apps/web/src/recovery/recoveryProvenanceLedger.test.ts apps/web/src/recovery/recoveryProvenanceLedgerInvariant.test.ts apps/web/src/recovery/recoveryProvenanceAudit.test.ts` from the repository root. The source audit imports the shared `forbiddenOrgNeedles()` helper.
