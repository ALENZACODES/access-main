# Local recovery journal

The live `RecoveryCenter` mounts both `RecoveryCaseJournal` and `RecoveryTaskBoard` without replacing either component. This is a session-only record of human-initiated pack inspections, downloads, exports and reviews. It does not change the downloaded pack store, start a network request, remove local data, or claim anything about a physical location.

A case has an explicit pack ID, an opening time, a phase, and zero or more timestamped events. An event can have UNKNOWN, failed, incomplete or completed-step outcome. Missing evidence is represented by `null`, never a guessed source. When evidence exists it contains source, open licence, source date and a user-supplied tier. Imported journals are untrusted historical notes; they never override a fresh local inspection.

The JSON reader rejects unexpected properties, duplicate IDs, events outside chronological order, unsupported versions, invalid source metadata, markup/control characters and oversize documents. Limits are 40 cases, 100 events per case, 1,200 characters per note and 384 KiB per journal. No persistent storage is used without an explicit user-supplied save callback.

The component is bilingual (English and French), uses native labels/status regions, and gives controls minimum 44px hit areas. It is intentionally independent of server APIs and external tiles.

Run `vitest run apps/web/src/recovery/recoveryCaseJournal.test.ts` from the repository root. Existing app checks remain the authority for all other packages.

## Preview and merging

Import first stages the file in memory and shows a comparison. The user must choose **Add new cases** before anything changes in the journal. Exact duplicate cases are skipped. Local-only cases are retained. A reused ID with differing event history or phase blocks the entire merge instead of resolving the conflict by overwriting data. Imported case timestamps are checked against the merged document timestamp, and the combined document remains subject to the normal case and byte limits.

## Integration on current main

Both widgets are mounted after `RecoveryPlanReview`, using the same current inventory but independent local state. The journal is a chronological account of manual actions; the task board is a separate planning checklist. Neither component changes local pack status or starts a transfer, and their JSON formats are not interchangeable. Both are exported through `recovery/index.ts` for typed use by the web shell.

The literal status token is **UNKNOWN** in both languages; French explanations may be translated, but the token is never localised. The archive overlays only these added modules, their tests, the updated recovery barrel and the merged `RecoveryCenter`.

## Four recovery tools on the offline page

`RecoveryCenter` mounts **all four** independent tools, in this order, after the
existing workbench, queue, and plan review:

1. `RecoveryEvidenceNotebook` — manually entered field evidence, including
   source, open licence, evidence date and tier; missing evidence stays UNKNOWN.
2. `RecoveryDryRunPanel` — a storage-budget rehearsal only, with no download,
   deletion or replacement of data.
3. `RecoveryCaseJournal` — chronological, session-only manual recovery history.
4. `RecoveryTaskBoard` — a separately maintained manual follow-up task list.

All four are exported by `recovery/index.ts` with their public types and local
models. Both journals and imported task data are local to their component state,
and do not modify pack storage or cause a scheduled task. A file imported into
one tool is not silently passed to another. `RecoveryPlanReview` remains mounted
and retains its original props and behaviour.

All locale-dependent copy is available in English and French. The unknown-state
token is spelled **UNKNOWN** in both languages; do not substitute a translation.
No interface claims that a place can be accessed based on a pack's availability.

## Integration regression

The audit `recoveryFourPanelsAudit.test.ts` checks that all four panels are mounted
by `RecoveryCenter` in addition to the existing plan, queue, download and export
controls. It also checks the inspection-date handoff to the storage rehearsal.
No panel sets another panel's state or treats a missing field as ready.

## Manual repair attempt notes

The same shell also mounts `RecoveryRepairAttempts`. It records separate,
source-attributed attempt notes and does not change local pack health or launch
operations. Each note includes an explicitly selected open licence, date, tier,
and outcome; the literal `UNKNOWN` applies when no outcome is known. Import is
staged and non-destructive, and export occurs only after a user action. The
implementation is covered by `recoveryRepairReceipt.test.ts` and
`recoveryRepairAudit.test.ts`.
