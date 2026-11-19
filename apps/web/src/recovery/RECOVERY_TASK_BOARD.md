# Manual recovery task board

This is a session-only, bilingual task board on the existing recovery screen.
It does not write to the offline pack store, start downloads, delete files, or
schedule actions. Closing a task never changes the pack's recorded condition.
An inventory state, including UNKNOWN, remains independent of a user's notes.

## Integration

`RecoveryCenter.tsx` mounts `RecoveryTaskBoard.tsx` and supplies the current
local pack inventory, selected language, and existing optional `saveFile`
callback. `recoveryTaskBoard.ts` owns the deterministic task model and bounded
JSON import/export. `recoveryTaskCopy.ts` owns the English and French copy.

Only complete tasks are accepted. Each task names a pack, manual action, note,
state, and timestamps. Source evidence is either explicitly UNKNOWN (`null`)
or a complete source, open licence, date, and evidence tier. Neither missing
provenance nor a successful task grants a pack ready status.

The file picker reads only a user-selected local JSON file. Imports are limited
to 256 KiB and 200 tasks, reject extra keys and unsafe identifiers, and show a
preview. An imported task never overwrites a local task with the same ID; a
conflicting ID blocks the entire merge. No network request is made by this
feature. Export is initiated by a user click and delegates the save action to
the existing host callback.

## Testing

The model unit tests cover invalid JSON, oversized files, dates, duplicate IDs,
unsupported state changes, missing source information, task assessments, and
non-destructive merges. The copy tests cover both languages and all reported
issue codes. Run the repository's normal lint, typecheck, and test commands
with its installed dependencies before merging.
