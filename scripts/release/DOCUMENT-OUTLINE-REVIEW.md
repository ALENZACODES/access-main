# Manual documentation outline review — P19 R79

This standalone Node-only release aid examines **user-supplied Markdown snapshots**. It does not crawl websites, inspect real places, determine whether a place is accessible, certify a document, or make availability claims. `UNKNOWN` is preserved exactly; reviewer decisions must be entered manually.

## Invocation

From `scripts/release`, after preparing a local input file:

```sh
npm run audit:document-outline -- --after /safe/path/current.json --format html --language en --today 2026-11-21
npm run audit:document-outline -- --before /safe/path/previous.json --after /safe/path/current.json --format json --output /safe/path/new-report.json --today 2026-11-21
```

The `--output` path must not exist; output is created with restrictive permissions. The CLI refuses symbolic-link input files, directories, oversized files and noncanonical parent paths. It reads only named files and makes no network requests. It never schedules tasks, modifies PWA runtime files, or changes a CI gate.

## Input contract

- `schemaVersion`: exactly `1`.
- `capturedOn`: valid `YYYY-MM-DD` not later than the explicitly selected review date.
- `documents`: bounded array of unique document identifiers and relative `.md` paths.
- Each document: `id`, `path`, `language` (`en` or `fr`), optional `pairId`, `title`, `body`, `state` (`UNKNOWN`, `draft` or `reviewed`), `source`, `licence`, `retrievedOn`, `tier`.
- Evidence tier: `UNKNOWN`, `self-reported`, `documented`, or `field-observed`. These are source descriptions, not claims of correctness.
- The maximum input size is 1,500,000 bytes and the number of documents is capped at 300.

The validator rejects extra object fields, duplicate identifiers, absolute paths, traversal segments, control characters and inconsistent dates. The sample exported by `fictionalManifest()` is invented for tests and does not describe a real location or organisation.

## Analysis modules

| Module | Responsibility |
| --- | --- |
| `document-outline-contract.mjs` | Manifest schema, path and provenance boundaries |
| `document-outline-parser.mjs` | Conservative Markdown headings, links, images, tables, code fences and anchors |
| `document-outline-review.mjs` | Severity-labelled review observations and bilingual outline parity |
| `document-outline-delta.mjs` | Changes in documents, headings, links and reported findings |
| `document-outline-policy.mjs` | Explicit human review ledger with stale-decision detection |
| `document-outline-navigation.mjs` | Internal link graph, orphans, reachable documents and cycles |
| `document-outline-coverage.mjs` | Locale coverage and structural differences without judging content accuracy |
| `document-outline-report.mjs` | Static English/French HTML, CSV, JSON and plain-text reports |
| `document-outline-cli.mjs` | Opt-in local file reader and safe new-output writer |

The Markdown scanner is deliberately conservative. It does not render arbitrary HTML, resolve full CommonMark reference definitions, or claim that links work on a live website. Static HTML exports have a skip link, one main landmark, table headings, visible focus, and no remote dependencies. CSV fields guard spreadsheet formula prefixes. French metadata use U+00A0 before colons and U+202F before semicolons; HTML/CSS syntax is never rewritten by localization.

## Reviewing findings

A `block` item indicates missing structure or an unsafe/unresolvable local reference *in the provided snapshot*. A `review` item flags something a person should inspect. An `info` item reports missing evidence or an editorial state. A reviewer may accept or defer an observation only with a reviewer name, date and note. Such a disposition does not establish WCAG conformance, real-world accessibility, or publication readiness. Stale ledger keys are surfaced and cannot silently close a changed issue.

## Release integration

This round adds only `scripts/release/document-outline-*.mjs`, tests, this documentation and a single opt-in `audit:document-outline` entry to `scripts/release/package.json`. Existing scripts remain unchanged. The feature is not imported into `apps/web`, service-worker precache, or `OfflinePackPage`, and does not alter the 524,288-byte OfflinePackPage chunk cap or other install, performance, timeout or test gates.

## Testing

```sh
cd scripts/release
node --test document-outline-*.test.mjs
```

The standalone tests exercise contracts, Markdown parsing, hostile inputs, review decisions, cross-document navigation, source comparison, localization, HTML/CSV safety, and CLI file handling. They do not replace the complete repository's CI, e2e, lint, strict typecheck or precache-budget checks.
