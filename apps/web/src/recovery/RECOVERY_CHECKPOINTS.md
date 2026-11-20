# Local recovery checkpoints

The checkpoints panel is mounted in the existing recovery centre. It stores
notes for the duration of the current page session, until the person explicitly
selects an export operation. It cannot change the installed pack database.

Each observation contains the selected pack, operation, time, manual condition,
optional reported bytes and optional supplied SHA-256, plus source, open licence,
source date, explicit evidence tier and reference. Optional measurements remain
absent in the JSON document as `null`, never invented or filled from a browser
heuristic. UNKNOWN conditions and tiers remain UNKNOWN in both languages.

The comparison view groups observations by pack and operation. A changed
measurement is a change in *reported data*, not proof of file integrity. A
reported-present observation cannot promote a pack to ready. A disagreement
remains visible, including after a later note. Review and dispute buttons
change only the manual review flag on a draft. Both import and export require
a user gesture; there are no scheduled tasks or background transfers.

The model rejects unexpected JSON keys, duplicate identifiers, oversized
imports, invalid dates, unsupported licences, markup and control characters.
Conflicting entries cannot be merged. The export includes the original source,
licence, date and tier on each observation, as well as a separate explanatory
report derived from the recorded notes. For any uncertain condition, the next
step is a manual investigation, not an automatic retry.

Run the focused tests with Vitest from the project root:
`vitest run apps/web/src/recovery/recoveryCheckpoint*.test.ts`.
