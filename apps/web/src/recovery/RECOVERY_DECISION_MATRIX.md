# Manual recovery decision matrix

The live `RecoveryCenter` mounts `RecoveryDecisionMatrix` alongside the recovery workbench, checklist, attempt log, provenance ledger and handoff panel. The matrix does not initiate or schedule downloads, exports, deletes, or retries. Its contents are session-only until a person deliberately chooses the local JSON save control.

## Safety and evidence

Each local choice retains its own pack ID, reported operation, condition, manual next step, source name, open licence, calendar date, reference and explicit evidence tier. A source statement never changes the saved pack's readiness or claims anything about physical accessibility. A missing condition or evidence tier retains the literal `UNKNOWN` in English and French. A review is append-only and final; changing a completed entry requires a new entry rather than rewriting history.

Imports are bounded to 256 KiB, 250 candidates and 500 review events. Input is checked for unknown keys, duplicate identifiers, chronology, missing links, unsupported licences and control characters. The preview displays new entries and collisions; conflicting IDs are never overwritten. Export only includes these manual choices and review events, not pack bytes or device identifiers.

## Evidence coverage

`decisionCoverage` provides a local summary of recorded reports per pack and operation. An unreported combination stays `UNKNOWN`. Contradictory known conditions remain disputed even if one occurs more frequently. Source count is informational, not a confidence percentage or a statement of readiness. Tier names are recorded exactly as provided and never inferred.

## Testing

- `recoveryDecisionMatrix.test.ts` covers schema, provenance, transitions, import/export, merging, filtering and translations.
- `recoveryDecisionCoverage.test.ts` covers unreported pairs, contradictions, source tiers and conservative summaries.
- `recoveryDecisionAudit.test.ts` protects the live mount, barrel exports, 44px controls, existing panels and shared restricted-name checks.

No background jobs, external tiles, remote APIs or hidden storage writes are used.
