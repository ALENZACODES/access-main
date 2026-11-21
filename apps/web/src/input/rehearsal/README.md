# P16 Round 34: device-local access rehearsal

This feature adds a usable keyboard and switch-style rehearsal at `/access-rehearsal`.
It is a *manual planning aid*, not a live source of conditions or an assertion
that a location or trip is usable. A person supplies their own steps and source
information, and the app only evaluates whether the entered observations have
sufficient metadata for a **local rehearsal**. It gives no medical advice or
eligibility decisions.

## Integration

- `apps/web/src/router.tsx` lazy-loads the page inside the existing `Section`.
- `apps/web/src/pages/HomePage.tsx` exposes a keyboard-accessible link.
- `apps/web/src/input/index.ts` exports the public model, scanner, semantic,
  reporting and translation helpers.
- `AccessRehearsalPage.tsx` mounts labelled forms, 44-pixel controls, an explicit
  switch-scanning keyboard and a polite live announcement.
- No account, network call, browser persistence, background task, or automatic
  recording is used. A refresh resets the locally entered steps.

## Decision semantics

`READY` means *locally entered rehearsal fields and observations satisfy this
session's checks*. It is **not** an accessibility or safety endorsement.
`HOLD` is used for contradictory or unsupported input. `UNKNOWN` remains
`UNKNOWN` for absent sources, unknown source tiers, missing offline status and
unsupported claims. An absent source is never silently replaced with a
third-party assertion. The form keeps source name, HTTPS URL, licence,
collection date, and evidence tier explicit when provided.

The user enters English and French labels and descriptions independently.
The French copy uses curly apostrophes and the prescribed no-break spacing
rules. Each step has a stable, local ID, an ordered position, and review flag.

## Modules

`model.ts` defines source and offline contracts, URL/path/date validation,
French copy checks, and journey-level decisions. `scanner.ts` is a pure state
machine supporting NEXT, PREVIOUS, SELECT, BACK, CANCEL, and RESET. It also
audits target geometry, reverse focus, keyboard events, and live announcements.
`semantics.ts` inspects accessible names, ID references, focus order,
landmarks and semantic changes. `report.ts` creates deterministic comparisons,
regression findings and CSV/JSON/JSONL without copying step descriptions into
structured diagnostics. The UI only exposes CSV/JSON downloads, initiated by
the user. Export contents are local and contain no notes or source URLs.

## Tests

The seven `.node.mjs` suites use Node's test runner with strip-types enabled.
They cover valid and intentionally broken inputs, uncertainty, labelled
controls, reverse navigation, state transition bounds, document relationships,
source lineage, and privacy of exports. The Playwright spec performs actual
browser keyboard navigation, form entry, focus, touch-target checks, and
local-download checks.

From the repository root after dependencies are installed:

```sh
npm run lint
npm run typecheck
npm run test
npm exec -w @access/web -- playwright test e2e/a11y-input/access-rehearsal-round34.spec.ts --project=chromium
```

These automated tests do not reproduce screen-reader spoken output or the
timing of a physical assistive switch. Those still require hands-on testing.
