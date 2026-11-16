# Current-main recovery integration

This replacement integrates the recovery workbench and manual queue into the existing offline-region page. It uses the current public `PackSource` interface only. No automatic retries, file deletion, or network requests are performed by the recovery panels. Download actions call the existing explicit region download handler.

The current data-client interface does not expose saved raw part bytes or an atomic replacement API. A user-triggered recheck therefore reports **UNKNOWN**, rather than treating an IndexedDB entry as an integrity result. The redownload control opens the existing delete confirmation; a new download must be requested separately. Raw-byte integrity inspection and atomic replacement from PR #68 require a compatible data-client extension before those features can operate.

These files replace missing imports of `RecoveryWorkbench` and `RecoveryQueuePanel` with explicit, locally provided components. The French recovery copy avoids the prohibited imperative and uses bilingual text.

## Recheck behaviour

`assessStoredRegion` compares the current pack inventory and stored-cell ledger.
A contradictory saved status is reported as damaged; any status that cannot
be supported by a fresh byte digest remains UNKNOWN. The current parsed-record
cache cannot reconstruct the original compressed bytes, so this path does not
claim SHA-256 integrity. The re-download action requires explicit deletion
confirmation and a separate download request. Tests cover contradictory
completeness, stale cells, absent metadata and inconclusive matches.
