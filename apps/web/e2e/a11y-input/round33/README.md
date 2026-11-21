# P16 Round 33: keyboard journeys, switch scans, and live-region receipts

This round adds a read-only, bounded keyboard journey assessment for the accessibility shell. It is additive to the current `access-main` branch and does not change an existing route, persisted record, or shared UI component. Its browser fixtures use synthetic controls and local HTML only. No network requests, scheduled actions, authentication, storage writes, or external services are required.

## Modules

- `contracts.mjs`: validates bounded semantic records, names in English and French, stable IDs and ID references, dates, source attribution, licence, evidence tier, and local offline paths. Unknown evidence never becomes a ready state.
- `switch.mjs`: pure model of linear, grouped, and direct switch scanning with next, previous, select, back, cancel, and restart. Also audits focus walks, reverse paths, target geometry, and actual selections.
- `announcements.mjs`: audits live-region observations, message sequence and priority, bilingual announcements, repeats, source status, and privacy-safe receipts.
- `report.mjs`: integrates the audits, retains structural diagnostic codes, compares results, and produces safe CSV, JSON, and JSONL outputs.
- `browser-fixture.ts`: read-only Playwright snapshots of real focus movement, live-region semantics, and DOM ID references.
- `fixtures.node.mjs`: synthetic, non-personal examples for the Node suites only.

Five `.node.mjs` suites cover the pure modules and their integration. Four Playwright specs exercise native browser keyboard interactions, switch alternatives, announcements, modal focus, and form feedback.

## Commands

From the repository root, with dependencies installed:

```sh
npm run lint
npm run typecheck
npm run test
npm exec -w @access/web -- playwright test apps/web/e2e/a11y-input/round33 --project=chromium
```

The existing Playwright configuration builds and serves the web app. Browser specs use `page.setContent` and do not require a named feature route. The repository `test:scripts` command includes all prior hooks and these five new Node suites; the complete updated root `package.json` is included because that script changed.

## Limits

DOM checks can demonstrate structural focus and event behaviour, not actual spoken output, switch hardware timing, or an exhaustive accessibility assessment. Native dialogs may briefly park focus on the dialog element or document body while retaining modal input containment. This model allows that behaviour without permitting background interactive focus. Any issue code is a regression signal that requires investigation, not a factual assertion about a person, business, or accessibility condition.

The French contract uses U+2019 apostrophes, U+00A0 before colons, U+202F before semicolons, exclamation marks and question marks, and U+202F inside guillemets. Test source uses Unicode escapes for no-break characters to keep ESLint source rules satisfied. Unknown states remain `UNKNOWN`; they are not silently promoted to readiness.
