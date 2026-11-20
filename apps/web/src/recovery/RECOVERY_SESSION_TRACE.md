# Local recovery session trace

This is a manual record of what a person observed while working with an offline pack, download, or export. It is mounted in `RecoveryCenter` after the existing recovery panels. It never starts, resumes, cancels, or deletes a download and never changes saved-pack readiness.

Each trace has a pack ID, operation, user-reported outcome, opening timestamp, optional expected byte count, and source metadata: name, open licence, calendar date, explicitly selected tier, and optional reference. Each timestamped moment has an independent stage, optional observed byte count, and an optional note. Unknown byte counts remain `UNKNOWN` rather than being estimated.

The analysis reports possible inconsistencies such as a decreasing observed size, observed bytes above the stated expected size, a missing source reference, missing review notes, or a long gap between observations. These are prompts for human review, not determinations about the downloaded files. Even a user-reported completed transfer never marks a pack ready.

Import is a local JSON file selected by the person. The parser rejects oversized files, unexpected fields, duplicate IDs, invalid timestamps, missing provenance, unsupported licences, and inconsistent event order. Before merging, collisions are displayed and blocked; no existing trace is overwritten. Export uses the existing host-supplied `SaveTextFile` callback. Nothing is uploaded or saved automatically.

All controls have a minimum 44px target. All UI labels are available in English and French. The shared `forbiddenOrgNeedles()` audit is used in tests. The status token is `UNKNOWN` in both languages.

Run the local repository validation after placing the files in the current-main checkout with `npm run lint`, `npm run typecheck`, and `npm test`. The scoped tests are `recoverySessionTrace.test.ts`, `recoverySessionAnalysis.test.ts`, and `recoverySessionAudit.test.ts`.
