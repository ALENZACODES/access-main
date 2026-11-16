# P20F — state-transition, map and offline browser gates

This round extends P20–P20E without changing files outside
`apps/web/e2e/axe-sweep/`. All new code is exercised through Playwright:
`p20f-live.spec.ts` imports the browser collectors, policy functions and
resilience runner; the two additional specs exercise their contracts with
synthetic inputs, including deliberately failing examples.

## What is added

- Shared typed contracts for route transitions, search result updates,
  checkable filters, maps, interactive controls, accessible status regions,
  language discovery, status records and source attribution.
- A conservative three-state model: `UNKNOWN` remains distinct from
  `PASS` and `BLOCKED`; network failures never create positive evidence.
- Source, open licence and calendar-date checks for evidence-bearing
  records. The accepted licence list is explicit and can be expanded only
  after a documented review.
- EN and FR live route crawling bounded by `P20F_MAX_ROUTES` (default 48),
  including axe checks on each discovered document.
- Keyboard entry, route-change announcements, required inputs, readable
  errors, named icons, target dimensions of at least 44×44px, searchable
  empty results, filter announcements and accessible map alternatives.
- Offline entry-point trials in both locales, including readable fallback,
  keyboard-operable retry, stale information notices, and no assertions of
  accessibility derived from a failed request.

## Execution

Run Playwright using the repository's existing test configuration and local
App server. These files use `@playwright/test` and `@axe-core/playwright`,
consistent with the earlier axe-sweep tests. No additional dependencies,
credentials, web tile services, data files or scheduled jobs are introduced.

`AXE_SWEEP_EN_URL` and `AXE_SWEEP_FR_URL` can select local locale entrypoints.
`P20F_MAX_ROUTES` bounds the browser crawl to between 2 and 200 pages.
The contract specs do not need the running App. The live spec does.

Search, filters and maps are conditional: the test checks the control when
present and requires corresponding EN/FR functionality. No data is inferred
from the absence of such a control. The offline entrypoint checks are
mandatory. These tests inspect rendered interfaces rather than asserting
that any place, journey or route is accessible.

## Scope boundary

The repository snapshot is not available in this lane. The code therefore
adds new runner-discovered specs rather than editing an unknown shell or
config file. These gates do not create application features, offline caches,
map tiles, translations or content records. Running the browser suite against
the actual built app is needed to identify integration failures.
