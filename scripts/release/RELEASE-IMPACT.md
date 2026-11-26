# Manual release dependency impact ledger / Registre manuel des dépendances

This feature adds a strict, entirely local review workflow for release artifact
inventories. It compares two explicitly supplied metadata files and records which
entry points reference a changed asset. It does **not** certify browser behaviour,
accessibility conditions, deployment success, translation quality or file contents
unless the optional byte-hash inspection is enabled.

## Manual operation

The release `package.json` adds `audit:release-impact` without removing any
existing script. No build or CI job invokes it automatically. There are no
scheduled workflows, telemetry, remote requests, keep-awake tasks or retries.

A reviewer supplies an `--after` JSON file and an `--output` destination. Other
options are `--before` for a previous release, `--format` (html, text, csv, json),
`--language` (en, fr), `--today` (YYYY-MM-DD), and `--assets-root` for actual local
asset byte comparison. The command creates an output with exclusive creation
(`wx`) and rejects overwrite. The file input is bounded to 2,097,152 bytes.

The output is static. The HTML report has a document language, semantic
headings, a named navigation landmark, a table with row and column headers,
44px navigation targets, and visible focus. CSV exports protect formula-like
cells. In French, display punctuation uses NBSP and narrow NBSP where needed.

## Manifest contract

Top-level properties are `version: 1`, `createdOn`, and `assets`. Each asset
requires: `id`, `path`, `sha256`, `bytes`, `kind`, `locale`, `entry`, `dependsOn`,
`source`, `licence`, `retrievedOn`, `tier`. No unexpected fields are accepted.
All paths are relative and cannot traverse directories, name URLs, or contain
percent escapes. Assets are limited to 50 MiB each in the metadata contract.
At most 4,096 assets and 32,768 dependency edges may be supplied.

Evidence tier `UNKNOWN` is a literal, not a status that can be rounded upward.
Every asset has a source, licence and retrieval date. A valid digest is a byte
identifier; a matching digest is not proof of accessibility or authorisation.

## Graph analysis

For each manifest, the release graph resolves asset IDs and their dependencies.
It identifies entry points, shared dependencies, orphaned assets, dependency
cycles, and downstream effects when an asset changes. The diff distinguishes
asset additions, removals, moves, digest changes, provenance changes,
locale changes, entry-point changes and dependency changes. All lists are sorted
for reproducibility and any task remains manually reviewed.

## Files

- `release-impact-contract.mjs`: schema, provenance, path safety, bounds
- `release-impact-graph.mjs`: dependency graph, cycles, roots and reachability
- `release-impact-delta.mjs`: before/after changes and affected entry points
- `release-impact-policy.mjs`: bounded review priorities and manual tasks
- `release-impact-integrity.mjs`: optional local SHA-256 and size comparison
- `release-impact-report.mjs`: EN/FR HTML, CSV, JSON and text outputs
- `release-impact-cli.mjs`: manual entry point with safe local file handling
- `release-impact-fixtures.mjs`: fictional sample input for tests
- Eight `.test.mjs` files: contracts, graph, delta, policy, integrity, reports,
  CLI and cross-module integration

The existing test command `node --test --experimental-strip-types *.test.mjs`
will discover every new `.test.mjs` in this directory exactly once.
The feature does not import a PWA module or affect Vite's install precache.
No install budget, gate, timeout, retry policy, or test exclusion is altered.
