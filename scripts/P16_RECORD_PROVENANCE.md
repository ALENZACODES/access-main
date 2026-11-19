# P16 — record provenance and offline accessibility gate

This incremental test-only utility audits structured information cards used in a
bilingual accessibility experience. It never modifies application data, makes
network calls, chooses a reliability tier, translates content, or persists a cache.
It is intentionally independent of the UI and avoids imported project modules.

## Record shape

```js
{
  id: "stop-01-en",
  translationKey: "stop-01",
  locale: "en",
  title: "Step-free entrance",
  description: "Entrance information supplied by the listed source.",
  state: "available", // available | unavailable | unknown
  tier: "primary", // primary | secondary | community | unknown
  source: {
    name: "Transit open data",
    url: "https://data.example.org/stops",
    licence: "Open data licence",
    collectedOn: "2026-11-19",
    lastReviewedOn: "2026-11-19" // optional
  },
  offline: { state: "cached", key: "/offline/stops/stop-01.json" }
}
```

The contract distinguishes unknown information from absent fields. Unknown
status must have the unknown tier; the audit never upgrades an unsupported
claim. Cached records require a safe, same-app absolute path. Uncached records
must not advertise a cache key. All source URLs must use HTTPS with no embedded
credentials. Attribution requires a named source, licence and calendar date.

Use `auditRecord(record)` for single cards and `auditRecordSet(records,
{ requireBothLocales: true })` for translation-complete collections.
Every finding has `code`, `path`, and `recordId` for audit tooling; do not render
raw untrusted source or descriptions into a diagnostic HTML fragment.

## Run

From the repository root:

```bash
node --check scripts/p16-record-provenance.mjs
node --check scripts/p16-record-provenance.test.mjs
node --test scripts/p16-record-provenance.test.mjs
```

The tests exercise English/French entries, source/licence/date/tier, offline
keys, duplicate records, translation gaps, malformed inputs and stable output.
They use only Node built-ins. Keep existing DOM-ID regression tests in place.
This module does not claim to reproduce keyboard, screen-reader or physical
switch interaction: those remain separate browser-based tests. It also does
not inspect any real record until a caller supplies one.
