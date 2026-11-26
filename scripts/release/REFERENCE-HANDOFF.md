# Outbound reference handoff review / Examen des liens externes

This is a manually invoked, Node-only release tool. It reads a source-provided
inventory of outbound references without contacting any remote host. It does not
establish current link availability, accessibility of any place, or correctness
of a linked resource. All statuses describe recorded observations, not website checks.

## Inputs

Pass a local JSON snapshot with `schemaVersion: 1`, `capturedOn`, and an array
of `references`. Each entry records:

- `id`, `route`, `locale` (`en` or `fr`), `label`, and a full `https:` URL in `destination`
- `purpose`: `data-source`, `licence`, `public-resource`, `download`, `contact`, `map-credit`
- `source`, `licence`, `retrievedOn`, and `tier` for provenance
- `status`: `AVAILABLE`, `UNAVAILABLE`, or `UNKNOWN`; an explicit observed status
  must have a `tier` other than `UNKNOWN` and an `observedOn` date
- Optional `pairId` to identify a linked EN/FR pair, and optional `note`

`UNKNOWN` is never localized or converted to a positive or negative outcome.
A syntactically valid URL is not evidence of availability. Unsafe schemes,
credentials, private hosts, nonstandard ports, IP literals, fragments,
secret-bearing query parameter *names*, control characters, and excess length
are rejected. Tracking query keys trigger manual review findings.

## Run manually

From `scripts/release`:

```sh
npm run audit:reference-handoff -- --after /path/to/snapshot.json --today 2026-11-21
npm run audit:reference-handoff -- --after /path/to/next.json --before /path/to/previous.json --format html --language fr --output /path/to/new-report.html --today 2026-11-21
```

An explicit `--today YYYY-MM-DD` is recommended for reproducible audits.
The optional `--stale-days` is an integer from 1 to 3650 (default: 180).
Supported report formats: `text`, `html`, `csv`, and `json`.

The command rejects symbolic-link input files, oversized input, duplicate
before/after inputs, and output paths that equal an input. Reports are created
exclusively (never overwrite an existing file) with owner-only permissions.
All file operations are local. There are no network, background, or scheduled
operations. No release gates or install budgets are changed.

## Review output

The review flags uncertain statuses and tiers, stale retrieval or observation
dates, observed unavailable outcomes, tracking parameters, duplicate route
links, and missing or inconsistent EN/FR pairs. It reports possible changes
between two recorded snapshots, including recorded regressions and transitions
involving `UNKNOWN`, which remain indeterminate.

`reference-policy.mjs` additionally supports local human review decisions:
`acknowledged`, `needs-source`, or `deferred`. These are workflow dispositions,
not approvals, source authenticity judgments, or confirmations of link status.
No decision causes a network request, message, or automatic follow-up.

The package's test suites use fictional domains and records exclusively.
Run the focused test suite with:

```sh
node --test reference-*.test.mjs
```

The standard repository release test command also discovers these tests via
`*.test.mjs`. These scripts live under `scripts/release` and are not imported
by the PWA, its service worker, or its install precache.
