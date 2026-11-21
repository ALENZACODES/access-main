# P20AR · Accessibility questions packet

## Purpose

A local-only planner for accessibility questions before a journey. It makes unknown evidence explicit and requires a source, licence, and retrieval date before an answer can be treated as sourced. It does not assert accessibility conditions, partnerships, eligibility, current operations or safety at any real place.

## UI

Route `/question-packet`; the home page card is bilingual. Each stop contains reorderable questions, localized prompt and details, an explicitly reported answer, evidence provenance, and follow-up state. Generic prompts are optional and never prefill an answer. Controls use a 44×44 CSS pixel minimum; keyboard access is native. The app's existing language switch controls text and reports.

Import/export is local to the browser, with a 512 KiB JSON limit. JSON round trips preserve answer metadata. CSV prefixes potential spreadsheet formulas with a single quote. Plain text is for human handoff, not machine verification. Invalid imports leave the existing draft unchanged.

## Evidence and status semantics

* `UNKNOWN` is the initial answer, source, licence, URL, retrieval date and review state.
* `YES_REPORTED` / `NO_REPORTED` / `PARTIAL_REPORTED` are *reported* observations, not a claim from the app.
* `NOT_APPLICABLE` is a reported answer and must not be silently inferred.
* A source marked `OFFICIAL` only describes what the user entered; the app does not authenticate it.
* Dates and URLs are validated for format and safe scheme, not independently checked for truth.
* The change ledger is device-local, scoped to the current session and never sent to an external service.

## Modules

`model.ts`: immutable edits, caps, validation, import, summary.
`copy.ts`: EN+FR labels, category and state terminology.
`report.ts`: localized JSON, CSV and plain-text exports with spreadsheet formula protection.
`history.ts`: local event reconciliation and bounded history, without automatic network calls.
`triage.ts`: review priority, unresolved questions and printable checklist.
`templates.ts`: generic questions with UNKNOWN answers and empty provenance.
`audit.ts`: evidence-quality checks for invalid or incomplete records.
`QuestionPacketPage.tsx`: lazy-loaded screen, native keyboard controls, local file input.
`index.ts`: complete public barrel.

## Tests

Nine `.node.mjs` suites are registered in root `test:scripts`. The Playwright file uses the shared route helper to exercise both languages at 320px and 1280px. The repository's full lint, strict TS and browser/production budget checks should run in CI on a complete checkout.
