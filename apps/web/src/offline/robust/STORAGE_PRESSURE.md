# Storage-pressure panel and retry

For non-React hosts, import `mountStoragePressurePanel` from `offline/robust` to mount an opt-in
English/French status and retry control. Pass the existing region manifest,
atomic cell store, first-party fetcher and storage estimator. Call the returned
cleanup function on unmount. The control is at least 44 × 44 CSS pixels, uses a
native keyboard-operable button, and announces changes through a polite status
region. The host must retain visible focus styling.

Retries are serialised and only missing manifest cells are fetched. Quota
pressure preserves saved cells and reports the remaining cells as not
downloaded (UNKNOWN is kept for unlisted or unreadable cells); offline data is
not evidence of accessibility.

On the live `/offline` page, `RegionPackPage.tsx` renders `pressureView` for
the region's last incomplete download result (quota, pause or failed cell):
the guidance line plus saved and not-downloaded counts. Dataset source,
open licence and date remain mandatory in the manifest. No automated retry,
background downloads or third-party tile requests are introduced.

Run `vitest run apps/web/src/offline/robust/storagePressure.test.ts`.

## Round 3: inventory and explicit retry

The existing `mountStoragePressurePanel` entry point now mounts the region
inventory dashboard. This keeps the integration on the same shell interface
used by the previous release; no new host route or network endpoint is needed.
The panel checks locally saved cells on mount, displays estimated remaining
bytes and storage headroom, and includes a manual download/retry and stop
button. Buttons are native and at least 44 × 44 CSS pixels. Each declared
cell can be inspected along with its source, open licence and date. Cell
pages avoid rendering an unbounded list. Source and licence are manifest
metadata, not accessibility assertions. A missing, stale, or unreadable cell
remains UNKNOWN; the presence of saved bytes never establishes physical
accessibility. Browser quota estimates are advisory and quota failures can
still occur after a sufficient estimate. Cancelling retains committed cells.
No automatic requests or background retries are made.

The host continues to supply a first-party cell fetcher, atomic cell store,
open-licence manifest and storage estimator. The panel makes no requests until
the user activates download. Tests cover inventory, quota planning, manual
retry and interruption:

`vitest run apps/web/src/offline/robust/*.test.ts`
