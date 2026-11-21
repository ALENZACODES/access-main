# Manual repair attempts

`RecoveryRepairAttempts` is rendered inside `RecoveryCenter` beside the four
existing recovery panels. A manual note is never proof that a downloaded pack
is ready or that a location is accessible. Attempt outcomes are only reported
observations; the local store retains sole authority over pack readiness.

The user may add entries after explicitly inspecting the local inventory. Each
entry requires an identified pack, operation, timestamp, source, open licence,
source date, evidence tier, and a user-selected outcome. Missing information
is rejected rather than inferred. UNKNOWN is deliberately preserved in EN
and FR. The notebook exists in component state only until the user chooses
export; it does not schedule work, call an external service or persist silently.

Imports are size-bounded, schema-checked and staged before use. An identical
attempt ID is not duplicated; an attempt ID with different history blocks the
entire import. Imported entries cannot trigger downloads or update source
records. Each action control has at least a 44-by-44 pixel target.

`recoveryRepairReceipt.test.ts` covers the document validator, provenance,
manual transitions, imported data, conflict handling, and UNKNOWN outcomes.
