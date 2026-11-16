# Pack, download and export error recovery

This directory provides typed error classification, bilingual recovery text and
an accessible notice for failed pack, download and export operations.

Integrate by wrapping the existing user-triggered operation with
`runRecoverable("download", () => downloadFile())`. On a failed result, render
`<RecoveryNotice failure={result.failure} locale="en" onRetry={retry}
onDismiss={dismiss} />` and supply `onCheckInput` if appropriate. Retry handlers
must be explicitly user-triggered; storage guidance does not delete files.

The wrapper does not validate file integrity, resume transfers, remove partial
files, or persist anything. Callers must independently validate final output
before marking it complete. Unknown errors remain `unknown` and no exception
message is exposed in user-facing text. Pass an actual `source` with name,
open licence and source date when sourced data is involved; missing metadata
is not invented. The notice displays provenance only when all three fields
are provided. Localised strings are provided for English and French. All
notice buttons have a minimum 44 by 44 CSS-pixel touch target.

Run `vitest run apps/web/src/recovery/recovery.test.ts` from a workspace with
Vitest installed.

## Corrupted packs and re-download (round 2)

`checkPackIntegrity` checks an actual byte count and SHA-256 digest against an
independently supplied `PackManifest` containing source, open-licence identifier
and source date. An absent or unsupported manifest, or an unavailable digest,
returns `unknown`, not `complete`. Use `CorruptPackNotice` for bilingual,
accessible guidance and a user-initiated re-download button (44px minimum).

Connect that button to `redownloadPack(download, manifest, commit)`. This stages
bytes in memory, checks them before invoking `commit`, and never automatically
retries. `commit` must atomically replace persisted data; the wrapper cannot
undo a partial write by an unsafe callback. Do not expose a failed or unchecked
pack as usable. Never derive the expected hash from the downloaded bytes.

Run `vitest run apps/web/src/recovery/packIntegrity.test.ts`.

## P17C: local recovery centre

`RecoveryCenter` is a mountable, bilingual shell component exported from the
existing recovery index. Provide a `LocalPackStore` implementation (only explicit
IDs, bytes and independently supplied manifests), an optional user-initiated
`SessionOptions` download, and an optional `SaveTextFile` callback. The component
wires all three P17C modules: local inventory inspection, bounded streaming
pack replacement and a private local JSON status report. No third-party servers,
background transfers or automatic retry are introduced. Nothing automatically
reads the user's directory or uploads exported files.

`inspectPack` checks bytes on every inspection: absent, damaged and UNKNOWN packs
cannot be opened by `canOpenPack`. A successful digest is a pack-content check,
not a claim about accessibility of any place. A missing or unrecognised licence,
source date, digest or manifest stays UNKNOWN. Store adapters must never serve
an old ready status from a previous inspection.

`PackDownloadSession.start` consumes a caller-supplied asynchronous byte stream,
limits allocation to 32 MiB by default, checks byte count and SHA-256 against
an independently supplied manifest, and then invokes an **atomic** replacement
callback. Cancellation is explicit, no incomplete bytes are committed, and a
failure never triggers an automatic retry. A cancellation during a commit may
leave the commit outcome UNKNOWN; adapters must provide all-or-nothing writes.

`createRecoveryExport` makes a bounded, sorted JSON status report of local pack
IDs, states and supplied provenance only. A purported ready record without
source, open licence and date is downgraded to UNKNOWN; unsupported metadata is
rejected. It does not contain geographic claims or private images and cannot
transmit the report. The caller owns the save destination and any permissions.

Tests: `vitest run apps/web/src/recovery/{packInventory,downloadSession,recoveryExport}.test.ts`.
Before mounting a specific route, connect its actual offline store and pack
loader: this package does not pretend a route exists in repositories not included
in this patch.

## P17D: local health review and change history

The existing `RecoveryCenter` now mounts `RecoveryWorkbench`. No new route,
network destination or optional device permission is required. The workbench
is visible after mounting the existing recovery shell. It runs bounded local
metadata diagnostics, displays manual recovery steps, compares consecutive
explicit local inspections, and holds a small review history in component
memory. Buttons use at least 44 by 44 CSS pixels, native focusable controls,
headings, lists, and live-region status. All user-facing copy is paired in
English and French.

Diagnostics never promote local metadata to a content-passing state. The old
byte-level integrity gate remains the only basis for displaying a local pack
as ready. Missing source, open licence, inspection date, and file size are not
filled in from device or network heuristics. Open licence strings are kept to
an explicit allowlist. Dates use strict UTC calendar parsing; older source
metadata is a prompt to review, not proof of changed physical conditions.

The checklist is intentionally **manual**: checking a box does not start a
transfer, discard an old file, edit a manifest or grant access to an unsafe
pack. An action can be marked started and reviewed; after another inspection,
a completed download item falls back to UNKNOWN if its file is not ready.
No external download URL is guessed. Source and licence detail issues are
kept visible even when content bytes match their expected digest.

The change summary compares only the previous and current inspections in the
same mounted shell instance. It reports observed file and provenance changes,
not changes to locations or services. Duplicate and unsupported identifiers
are rejected and do not appear in reports. The optional in-session review log
is bounded to 50 events, carries no personal information, remains in memory,
and can be cleared with a 44px button. There is no automatic polling,
background job or persistence of the history.

Run the tests with:

```sh
vitest run apps/web/src/recovery/recoveryDiagnostics.test.ts \
  apps/web/src/recovery/recoveryActions.test.ts \
  apps/web/src/recovery/recoveryComparison.test.ts \
  apps/web/src/recovery/recoveryAudit.test.ts
```

## Integration notes for the offline route

The offline region page accepts an optional `packSource` for deterministic route
checks and mounts `RecoveryCenter` with a local store. This store does not claim
byte-level integrity when the underlying client exposes only parsed records.
The region check keeps an UNKNOWN or damaged result visible in its row, even
when the notice is closed. The user-triggered download action never routes to
region deletion. Recovery error classification and notices are exported by the
package index for the profile, region and feature screens.
