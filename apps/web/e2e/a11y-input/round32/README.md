# P16 Round 32: switch scanning, semantic structure and announcements

This incremental lane package contains a read-only, event-driven switch
navigation model, semantic snapshot audits, live-region and offline-status
audits, synthetic Node regression suites, and an isolated Playwright browser
fixture. No production route, scheduler, cache, server, or background process
is added. Prior merged DOM-ID tests remain untouched.

## Contracts

`switch-model.mjs` accepts explicit switch events. It does not use timers,
click UI controls, invoke network requests, or persist scan state. A caller
supplies a sequence of `ADVANCE`, `BACK`, `SELECT`, `CANCEL`, and `RESET`
actions; no event is generated automatically. Only controls with complete
English and French labels and canonical identifiers can enter the candidate
list. Disabled, hidden and inert controls are excluded. Out-of-bounds scan
activity becomes `UNKNOWN`, not a fabricated successful action.

`semantic-audit.mjs` accepts a plain, already-collected accessibility snapshot
with nodes, roles, accessible names, tab order, ID references and landmarks.
It checks duplicate IDs, missing and ambiguous references, active descendants,
tablist and radio/listbox membership, hidden focus targets and heading levels.
The module produces structural diagnostics only. It never constructs a
screen-reader announcement or claims spoken accessibility output.

`announcement-audit.mjs` checks observed live-region messages and offline
metadata. It requires source publisher, licence, collection date, evidence
tier and explicit cache/access states. `UNKNOWN` is retained whenever source
or cache evidence is uncertain. A cached record does not establish real-world
accessibility on its own; it only provides a signal about an offline copy.

## Browser fixture

`browser-round32.spec.ts` uses `page.setContent()` to create a local document.
It tests actual native keyboard traversal, focus visibility, input activation,
switch alternatives, native dialog focus restoration, field validation,
ARIA tab navigation, live-region semantics and language switching. It sends
no requests to production routes and makes no persistent changes. Its results
are narrower than full manual testing with physical switches, speech output,
or assistive technology combinations.

## Running locally

From the dependency-installed repository root:

```sh
npm run lint
npm run typecheck
npm run test
npm run test:scripts
npm exec -w @access/web -- playwright test --config apps/web/playwright.config.ts apps/web/e2e/a11y-input/round32/browser-round32.spec.ts --project=chromium
```

The `test:scripts` command retains the entire preexisting list and adds the
four Round 32 Node suites. Playwright runs through the existing web app
configuration. Do not pass Playwright spec files to `node --test` or Vitest.

## Evidence and privacy

All fixtures use invented labels and example metadata. Diagnostic summaries
contain IDs, structural paths and reason codes; they do not echo untrusted
source descriptions. No URL, licence or evidence tier is inferred from a
missing value, and unresolved information remains `UNKNOWN`. Reports must be
reviewed before any claim about accessibility or availability is published.

## Language presentation

Both `en` and `fr` labels are required in switch records. French copy checks
reject straight apostrophes and require U+00A0 before a colon, U+202F before
semicolon, exclamation and question marks, and U+202F inside guillemets.
Source files use Unicode escape sequences when a no-break space is represented
in a test fixture to avoid irregular-whitespace lint errors.

## Boundaries

This package intentionally does not automate publication, modify the service
worker, create background tasks, add external dependencies or change route
registration. All inputs remain caller-owned. Existing P16 suites continue
to run; the complete `package.json` is provided only because the script hook
was intentionally changed.
