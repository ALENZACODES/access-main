# Manual failure checklist

`RecoveryFailureChecklist` is mounted inside the existing `RecoveryCenter` and
never performs a pack download, file deletion, or network operation. The user
starts a checklist after manually inspecting local pack information.

Each checklist is limited to one pack and operation and carries the supplied
source name, open licence, source date, and evidence tier. All five steps begin
as `UNKNOWN`. A user can mark a step as noted or skipped, but those choices
never change the installed pack status or assert anything about location access.

Import is bounded to 64 KiB and rejects extra fields, unsupported values,
unsafe strings, duplicate steps, and invalid provenance. Selecting a file only
stages its contents; the user must press the explicit apply button. A checklist
for a different pack or operation cannot silently replace the current one.
Export is a local JSON file through the shell's existing `saveFile` callback.

English and French labels use the same literal `UNKNOWN` state token. Controls
have minimum 44px targets and status messages are announced accessibly. The
existing `RecoveryCenter` inventory, recovery planning, and downloads remain
unchanged.

The unrelated open PR repair in this bundle adds `unknownLabel: "UNKNOWN"` to
both languages in `recoveryRepairReceipt.ts`, while keeping its public
`replaceRecoveryAttempt(document, attempt)` signature unchanged.
