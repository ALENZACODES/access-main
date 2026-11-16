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

`packIntegrity.ts` and `CorruptPackNotice` detect a damaged or uncheckable pack and offer a re-download. A pack is never treated as complete when the digest or size cannot be confirmed.
