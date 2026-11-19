# P16 Round 19 — bilingual offline publication readiness

This additive source-and-test chunk is independent of the existing P16 PR and
previously merged files. It is designed for immutable, caller-supplied records.
No network access, browser storage, authentication, external dependencies, or
scheduled workflow is required. The module is not wired to live application
routes: callers must supply their own source records.

## Files

- `scripts/p16-offline-readiness-round19.mjs` — deterministic readiness assessor
- `scripts/p16-offline-readiness-round19.node.mjs` — 106 focused Node tests

## Records

Each record includes a stable key, optional `translationKey` and `locale`,
EN/FR title, summary and access instructions, a source object with HTTPS URL,
publisher, SPDX-style open licence, evidence tier and collection date, plus an
offline object with state and optional cache path and capture date.

An offline path must begin with `/offline/` and must not contain traversal,
encoded escapes, fragments or query parameters. Stored entries need a capture
date. The module reports an outdated cache if its capture date precedes its
source collection date; it reports a stale source/cache when the age exceeds
`maxAgeDays`, defaulting to 365 days.

Diagnostics consist only of stable codes, field paths and severities. The
module does not include input record titles, descriptions, source URLs or
publisher names in output. A `review` status represents possible follow-up;
`blocked` indicates a structural or safety error. No reliability tier or
accessibility claim is silently upgraded.

Use `inspectReadiness()` for one record and `inspectReadinessSet()` for a
collection. The optional `requireBothLanguages` flag checks explicit locale
pairs and detects duplicate translations. The built-in bilingual fields are
also checked directly for every record.

## Running the focused checks

From the repository root:

```sh
node --check scripts/p16-offline-readiness-round19.mjs
node --check scripts/p16-offline-readiness-round19.node.mjs
node --test scripts/p16-offline-readiness-round19.node.mjs
```

The `.node.mjs` suffix is intentional: tests use Node's native runner, rather
than a competing Vitest registration. Existing package scripts do not change.
The baseline DOM-ID and keyboard regression suites remain untouched.

The JavaScript implementation can be typechecked independently with:

```sh
tsc --allowJs --checkJs --noEmit --strict --target ES2022 \
  --module NodeNext --moduleResolution NodeNext --skipLibCheck \
  scripts/p16-offline-readiness-round19.mjs
```

Before merging, run the repository's complete lint, typecheck, unit and browser
suites using its dependency-installed mainline checkout. Browser tests are
needed separately because this utility does not simulate assistive technologies.
