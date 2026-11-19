# Local recovery journal

The live `RecoveryCenter` mounts `RecoveryCaseJournal`. This is a session-only record of human-initiated pack inspections, downloads, exports and reviews. It does not change the downloaded pack store, start a network request, remove local data, or claim anything about a physical location.

A case has an explicit pack ID, an opening time, a phase, and zero or more timestamped events. An event can have UNKNOWN, failed, incomplete or completed-step outcome. Missing evidence is represented by `null`, never a guessed source. When evidence exists it contains source, open licence, source date and a user-supplied tier. Imported journals are untrusted historical notes; they never override a fresh local inspection.

The JSON reader rejects unexpected properties, duplicate IDs, events outside chronological order, unsupported versions, invalid source metadata, markup/control characters and oversize documents. Limits are 40 cases, 100 events per case, 1,200 characters per note and 384 KiB per journal. No persistent storage is used without an explicit user-supplied save callback.

The component is bilingual (English and French), uses native labels/status regions, and gives controls minimum 44px hit areas. It is intentionally independent of server APIs and external tiles.

Run `vitest run apps/web/src/recovery/recoveryCaseJournal.test.ts` from the repository root. Existing app checks remain the authority for all other packages.

## Preview and merging

Import first stages the file in memory and shows a comparison. The user must choose **Add new cases** before anything changes in the journal. Exact duplicate cases are skipped. Local-only cases are retained. A reused ID with differing event history or phase blocks the entire merge instead of resolving the conflict by overwriting data. Imported case timestamps are checked against the merged document timestamp, and the combined document remains subject to the normal case and byte limits.
