# Local recovery handoff

The manual handoff panel is mounted in `RecoveryCenter`. It is independent
of the installed pack store. It does not initiate retries, remove packs,
change content availability or establish accessibility information.

Each case records the affected pack, operation, reported condition, opening
instant, short summary and source details (name, open licence, source date,
evidence tier and optional reference). A separate sequence of immutable
manual decision notes makes the handoff history reviewable. The original
condition stays unchanged when someone closes a case.

The panel is session-only. A user can explicitly save a bounded JSON file,
select a local file for preview, and apply an import only when there are no
conflicting case IDs. Files do not upload automatically. Imported documents
are checked for strict property sets, limits, timestamps, text safety, open
licences, ordering and permitted transitions. An absent value remains UNKNOWN.

The source model is `recoveryHandoff.ts`; English and French copy is in
`recoveryHandoffCopy.ts`; the live panel is `RecoveryHandoffPanel.tsx`.
Tests cover the model, merge semantics, record attribution, copy and shell
mount. Buttons and file controls have at least 44px target dimensions.
