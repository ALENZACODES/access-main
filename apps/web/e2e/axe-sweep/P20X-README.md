# P20X: state-transition accessibility contracts

This chunk introduces three independent, read-only accessibility contract modules, plus their own tests and cross-contract scenarios.

## Coverage

- `p20x-announcements.ts`: live-region urgency, atomicity, visibility, duplicate messages, loading, errors, offline information, result-count changes, language transitions, focus preservation and timing.
- `p20x-forms.ts`: labels, native/ARIA state agreement, constraints, field/error associations, group choices, error summaries, submission announcements, correction, reset and focus continuity.
- `p20x-provenance.ts`: source/licence/date/tier integrity, missing information kept as UNKNOWN, observation/retrieval dates, source links, duplicate records, locale and offline continuity.
- `p20x-cross-contracts.spec.ts`: end-to-end state models composed from the independent modules.

## How to run

From repository root after installing the existing repository dependencies:

```sh
npm run lint
npm run typecheck
npm run test
npx playwright test -c apps/web/playwright.config.ts --project chromium 'p20x-.*\.spec\.ts'
```

The new specifications are model-only and do not start an app. They run under the existing Playwright discovery. The production app and its navigation, persistence, network and UI are unchanged.

## Policy

- No fabricated evidence, freshness, accessibility, compliance, or eligibility statements.
- Records with missing source metadata remain UNKNOWN.
- No scheduled jobs, external requests, telemetry, account mutations or writes to local storage.
- French examples use typographic apostrophes; no changes are made to the app's translations.
- No tests skip failures or introduce an allowlist for accessibility violations.

## Scope of checks performed in this package

- Strict TypeScript compilation of the seven newly created TypeScript files.
- 358 focused contracts exercised against the compiled files in an isolated test harness.
- No repository-wide ESLint, app build or live-browser suite was executed here because there is no full checkout with its installed dependencies in the local execution environment.
