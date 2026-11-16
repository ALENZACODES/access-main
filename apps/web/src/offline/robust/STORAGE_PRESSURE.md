# Storage-pressure panel and retry

Import `mountStoragePressurePanel` from `offline/robust` to mount an opt-in
English/French status and retry control. Pass the existing region manifest,
atomic cell store, first-party fetcher and storage estimator. Call the returned
cleanup function on unmount. The control is at least 44 × 44 CSS pixels, uses a
native keyboard-operable button, and announces changes through a polite status
region. The host must retain visible focus styling.

Retries are serialised and only missing manifest cells are fetched. Quota
pressure preserves saved cells and reports remaining cells as UNKNOWN;
missing offline data is not evidence of accessibility. Dataset source,
open licence and date remain mandatory in the manifest. No automated retry,
background downloads or third-party tile requests are introduced.

Run `vitest run apps/web/src/offline/robust/storagePressure.test.ts`.
