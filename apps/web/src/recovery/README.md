# Pack, download and export error recovery

Typed error classification, English and French recovery copy, and an
accessible notice for failed pack, download and export operations.

## Where it is used

| Failure path | Component | Operation |
| --- | --- | --- |
| Region download on `/offline` | `offline/RegionPackPage.tsx` | `download`, classified by `classifyPackDownloadError` |
| Preferences export (text and JSON) on `/profile` | `pages/ProfilePage.tsx` | `export`, through `runRecoverable` |
| Evidence pack export on `/settings/advocacy` | `features/featureScreens.tsx` (AdvocacyScreen) | `export`, through `classifyRecoveryError` |

Each shows `<RecoveryNotice>` with Try again (a user-pressed retry, never
automatic), Correct the data (moves focus to the input) where the input is at
fault, and Dismiss.

## Rules

- Raw exception text, part paths and byte counts are never shown.
- Pack download codes from `packages/data-client` map as follows: size, digest
  or record-count mismatch → invalid data; quota → storage; a failed fetch →
  offline only when the device reports it is offline, otherwise unknown.
- Unknown causes stay unknown. Nothing is described as verified.
- The notice shows source, licence and date only when all three are supplied.
- Storage guidance never deletes files.
- Buttons are at least 44 × 44 CSS pixels; the notice is a labelled `alert`
  with its own `lang`, and it does not move focus.

## Tests

- `recovery.test.ts`: copy coverage and classification.
- `RecoveryNotice.dom.test.tsx`: every operation and reason in EN and FR,
  rendered and checked with axe (WCAG 2.2 AA tags), handlers, provenance, and a
  check that no copy says verified or vérifié.
- `e2e/recovery.spec.ts`: a failed pack download on `/offline` in EN and FR
  (notice, 44 px targets, axe, retry), and a failed preferences export on
  `/profile` (notice, axe, retry saves the file).

## Damaged or uncheckable packs

`packIntegrity.ts` and `CorruptPackNotice` detect a damaged or uncheckable pack
and offer a re-download. On `/offline`, Check again re-reads the stored parts; a
region whose parts are no longer all on the device shows the notice. A pack is
never treated as complete when the digest or size cannot be confirmed.


## P17C: local recovery centre

`RecoveryCenter` is mounted on the live `/offline` page. It lists enumerated
region IDs from the same pack source the page already uses, inspects them
locally, and can export a JSON status report to a file the user chooses. A
cell-based region that is present but has no single pack digest is shown as
UNKNOWN; that status is not inferred from partial cell bytes. Download of a
replacement pack stays on the existing region controls, so this component does
not add a second “Download” button.

`inspectPack` checks bytes on every inspection: absent, damaged and UNKNOWN packs
cannot be opened by `canOpenPack`. A successful digest is a pack-content check,
not a claim about accessibility of any place.

`PackDownloadSession.start` consumes a caller-supplied asynchronous byte stream,
limits allocation to 32 MiB by default, checks byte count and SHA-256 against
an independently supplied manifest, and then invokes an atomic replacement
callback. Cancellation is explicit. No automatic retry.

`createRecoveryExport` makes a bounded, sorted JSON status report of local pack
IDs, states and supplied provenance only.

Tests: `vitest run apps/web/src/recovery/{packInventory,downloadSession,recoveryExport}.test.ts`.
