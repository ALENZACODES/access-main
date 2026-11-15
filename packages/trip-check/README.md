# @access-main/trip-check

On-trip one-tap checks (lane J9). Short prompts such as "Elevator working?" and
"Washroom usable for your transfer?" store a dated draft on the device. The
person answers Yes, No, or "I could not check" (written as `UNKNOWN`).

## Rules

- Prompts never auto-publish. Drafts leave the device only when the person
  exports a JSON file (`exportDrafts()`) and sends it themselves. There is no
  issue route, no token, no upload, no server.
- A local draft is tier 0 and is labelled "Unverified draft". It is never shown
  as a place fact. On export, records are written at tier 1 (community-reported,
  unreviewed). This package never assigns tier 2 or 3.
- "I could not check" writes `UNKNOWN`. Unanswered prompts render as
  "Not answered". Neither is shown as "no".
- Wording has no medical terms and no advice. A Vitest test scans EN and FR copy.
- Prompt `field_id` values are intended to match the sci-fields set. That set was
  not available when this was written, so confirm the ids on merge.
- Contribution licence on drafts is recorded as `CC0`. Confirm with I9 before use.

## API

- `PROMPTS`, `STRINGS` (EN/FR), `newDraft(prompt, value, opts)`.
- `Storage` interface, `MemoryStorage`, and `tableStorage(table)` for a Dexie
  table (structural type, no Dexie import). Schema hint: `"id, field_id, retrieved_at"`.
- `exportDrafts(storage, now?)` returns `{ file, blob, filename }` or `null`, and
  marks the drafts exported. `downloadBlob(blob, filename)` starts the download.
- `<TripCheck storage lang place_ref? />` works on React 18 and 19.

## I9 mapper

`toContributeDraft(record)` maps one exported record to this proposed shape:

```json
{ "kind": "trip-check", "field_id": "elevator_working", "place_ref": "example-place", "value": "yes|no|UNKNOWN",
  "source_id": "trip-check-device", "source_key": "trip-check:elevator_working", "licence": "CC0",
  "retrieved_at": "ISO date-time", "tier": 1 }
```

I9 owns the general export and may change this shape. This package does not edit
or import I9. Ingest only records the person has exported.

## Not included

Playwright and axe runs at 320 and 1280 px need a page that mounts the
component; that lives in the shell, outside this folder scope. The markup uses
native buttons in labelled groups, `aria-pressed`, a polite status region, and
44 px minimum targets, but axe has not been run here.
