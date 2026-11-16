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
and offer a re-download. On `/offline`, Check again runs `checkPackIntegrity`
over the raw bytes kept for each stored part, and also checks record counts
against the manifest. A digest, size or count mismatch shows the damaged-pack
notice with a re-download action. Re-download uses `redownloadPack` and only
commits after every part passes. A pack is never treated as complete when the
digest or size cannot be confirmed.
