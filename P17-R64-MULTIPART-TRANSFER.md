# P17 round 64 — multi-part recovery transfer

Source base: `a7d1bff745f1ff312bf84d1dd5b53e640fc25c90`.

This patch carries the P17 guided recovery review, recovery support brief, and
source refresh desk into the supplied main tree, retains the r63 recovery
transfer bundle, and adds a bounded multi-part transfer workflow.

## Feature scope

- Plan a multi-part set without reordering the selected recovery exports.
- Keep each numbered part as an ordinary recovery bundle.
- Open the complete set atomically; no member is exposed when any part fails.
- Check canonical base64, part byte lengths, SHA-256 fingerprints, part order,
  aggregate set identity, native bundle structure, and cross-part duplicates.
- Save original exports, ordinary part bundles, and a separate counts-only
  receipt.
- Compare a separately delivered receipt against the opened set.
- Audit part composition and compare an expected ordered member list with a
  received member list.

## Bounds

Four parts maximum; twelve exports per ordinary part; forty-eight exports per
set; 2 MB original bytes per part; 8 MB original bytes per set; 2.8 MB per
ordinary bundle part; 16 MB outer transfer file; 32 KiB counts-only receipt.

## Reconciled P17 changes

The overlay includes the P17 guided review (#268), support brief (#271), and
source refresh desk (#282), including their RecoveryCenter mounts, lazy-loaded
panels, barrel exports, supporting models, copy, and tests. Existing evidence
packet, transfer witness, handoff chain, reconciliation, drill, and receipt
ledger mounts and exports are retained.

## Validation record

- The new TypeScript/TSX files were parsed with the installed TypeScript
  transpiler: zero syntax diagnostics.
- Local import-path, privacy-needle, no-network/no-storage, no-scheduled-work,
  and French non-breaking-space source checks were inspected.
- `apps/web/scripts/check-install-budget.ts` is included byte-for-byte from the
  supplied main archive and was not edited.
- Full lint, strict typecheck, Vitest, browser, production build, and precache
  budget execution could not be run in this container: package dependencies
  were absent, `npm ci` failed with an npm internal error, and the package
  registry hostname could not be resolved. No green CI claim is made for this
  round. Hosted CI must run after applying the patch.
