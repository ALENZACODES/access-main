# Offline recovery evidence notebook

This is a session-only companion to the live recovery centre. It lets a person
record a source-attributed statement about an offline pack file, without
modifying the pack store. Every entry has a pack identifier, field key, value,
source name, open licence, source date and evidence tier. `UNKNOWN` is a
first-class value and is never interpreted as evidence that a file is usable.

The entry value describes only a user's note about a file. Neither an entry
nor a completed review asserts anything about access at a real-world location.
This notebook does not collect health information.

The bilingual panel uses button and input targets of at least 44px. It provides
an accessible status message and a native file picker. Data remains in memory
until the user explicitly chooses a local JSON export. No server calls,
background retries, scheduled tasks or automatic storage writes are made.

## File handling

- JSON format: `recovery-evidence-notebook-v1`
- Maximum file size: 512 KiB; maximum entries: 600
- Fields, IDs, timestamps, provenance and licence must pass a bounded schema
- Entries cannot include unsupported fields, embedded markup or control characters
- Review states advance only from open to a final decision; evidence is immutable
- Import is previewed before an explicit user action; conflicting histories
  prevent the entire merge
- Import cannot promote an UNKNOWN value to an inferred positive value
- The export callback is supplied by the host recovery shell

## Integration and tests

`RecoveryCenter.tsx` imports and renders `RecoveryEvidenceNotebook.tsx`.
The component imports `recoveryEvidenceNotebook.ts`, `recoveryEvidenceCopy.ts`
and existing recovery types. The module is therefore part of the live offline
route through the recovery centre, not a detached tool.

Run from the repository root:

```sh
npm run lint
npm run typecheck
npm test
```

The unit tests cover strict parsing, source dates, licence allowlisting,
unsafe text, timestamp ordering, immutable review states, UNKNOWN counts,
non-destructive merge preview, and duplicate handling. The source audit also
checks the live mount, bilingual copy, target sizing, and prohibited terms
using the repository's shared runtime helper.
