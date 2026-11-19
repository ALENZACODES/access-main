# Browser storage retention and local report

The existing `/offline` dashboard now includes an opt-in storage retention
control. The section reads the browser's available storage estimate and
retention preference on mount. It does not contact a remote provider or
request storage retention automatically. A retention request is made only
when the visitor presses the labelled button.

## Behaviour

- When browser storage interfaces are absent or fail, results remain UNKNOWN.
- Only safe, integral quota and usage measurements are displayed.
- A browser's retention preference is not a promise that data cannot be removed.
- The storage report includes only metadata: listed cell IDs, source, open
  licence, date, size, and an explicitly UNKNOWN documentation tier.
- A cell reads `saved` only when the complete inventory and all listed metadata
  agree. A missing, unreadable, stale, unlisted or conflicting row is UNKNOWN.
- Text and JSON exports stay on the device. They never export pack payloads.
- The mounted section uses native controls with minimum 44px targets, visible
  labels, and polite status announcements in English and French.
- No new third-party endpoint, scheduled action, telemetry, or automatic
  storage writing is introduced.

`storageDurability.ts` is the testable headless controller and metadata-report
implementation. `storageDurabilityPanel.ts` mounts the browser UI from
`offlineDashboard.ts`. `storageDurability.test.ts` and
`storageDurabilityPanel.test.ts` cover the integrity and safety rules.

Run from repository root after installing dependencies:

```sh
npm run lint
npm run typecheck
npm test
```
