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
