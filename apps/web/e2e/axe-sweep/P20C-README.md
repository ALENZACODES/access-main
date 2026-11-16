# P20C — deeper EN/FR, keyboard, touch-target and offline checks

This extension is executed by the existing Playwright test runner: the files
`interaction-regression.spec.ts`, `offline-regression.spec.ts`, and
`sweep-contracts.spec.ts` are entry points; they import the shared contracts
and browser audits directly. No application source or package entrypoint is
modified. This is a **test harness**, not a new end-user feature.

## What runs

- Crawl same-origin links in both language modes with a bounded queue.
- Apply axe WCAG A/AA rule tags to live documents.
- Check `html[lang]`, one visible main landmark, visible `h1`, and title.
- Enforce the project's 44px interactive target policy (inline text links may
  be exempt; ordinary spaced controls are **not** exempt).
- Check standard Tab focus visibility and Escape dismissal of any open modal.
- Inspect 320px reflow without treating browser zoom as a substitute.
- Warm each language's entry page, disconnect the browser and reload to check
  offline shell or honest offline messaging. This is a real offline reload,
  not a mocked HTTP response.
- Exercise deterministic unit contracts for URL scope, bounds, locale identity,
  `UNKNOWN` retention, and the source/licence/date evidence gate.

## Running

Use the repository's existing Playwright invocation with its configured
`use.baseURL` pointing at a **local**, running web build. The workspace must
already provide `@playwright/test` and `@axe-core/playwright` (the original
P20 suite has the same dependencies). A typical invocation is:

```sh
npx playwright test apps/web/e2e/axe-sweep
```

Depending on the workspace's `testDir`, use the path relative to that root.
Optional `AXE_SWEEP_EN_URL` and `AXE_SWEEP_FR_URL` override locale entrypoints.
The browser must run in an origin that permits service-worker registration
for offline checks (localhost or HTTPS). No external tile provider is needed.

## Limitations and interpretation

The runner cannot discover authenticated pages, navigation requiring user
input, hidden routes, or untranslated routes not linked from an entry page.
A crawl ceiling is an explicit failure, not a successful partial sweep.
The offline test requires an actual controlling service worker; a cache miss
must remain a failure. These checks supplement, not replace, keyboard and
screen-reader audits with assistive technology.

Passing axe checks is not a general accessibility certification. Missing
accessibility observations, missing provenance, or untranslated route
counterparts remain `UNKNOWN`; never display them as supported facts.
The source/licence/date validator is a **test-only** contract and does not
silently merge or redistribute geodata with distinct licensing obligations.
