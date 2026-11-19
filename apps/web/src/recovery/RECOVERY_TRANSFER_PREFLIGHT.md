# Manual transfer preflight — P17

`RecoveryTransferPreflight` mounts inside the live offline recovery shell.
It is a manual aid for investigating pack, download and export failures.
It cannot inspect or repair a file by itself and does not alter any cached pack.

The user explicitly selects a pack ID from the most recent local inspection,
records an operation and the reported condition, and supplies open-licence
source information, source date, tier and optional reference. Missing quantities
are represented by `null` and displayed as `UNKNOWN`, not zero. The preflight
calculates only potential storage shortfall, with no readiness claim.

A reviewer may mark an individual note reviewed or discarded, but cannot
rewrite a completed note. Manual actions are recorded in an append-only local
history. No network calls, deletion or automatic retries occur.

Local JSON import has strict schemas, byte and entry limits, and a preview.
Unrelated records may be added while duplicate identifiers with different
content block the merge. Export is by an explicit button through the parent
shell's supplied `saveFile` callback. No private device IDs or locations are
collected by this module.

Bilingual controls keep 44px minimum targets. Source, open licence, ISO date,
explicit evidence tier and a stable pack identifier are required for each
entry. Neither an import nor a manual review can change a stored pack's status.

Tests: `recoveryTransferPreflight.test.ts`, `recoveryTransferHistory.test.ts`,
and `recoveryTransferAudit.test.ts` cover schema limits, local history, merging,
UNKNOWN preservation, public exports, UI mount and prohibited-copy rules.
