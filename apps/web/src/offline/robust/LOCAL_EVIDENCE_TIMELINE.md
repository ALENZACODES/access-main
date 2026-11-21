# Offline evidence timeline

This panel records only the source metadata and the last explicit inspection result
for each listed offline cell. It never labels a physical place accessible, and
it does not check personal circumstances or eligibility.

## User actions

- **Capture local records:** asks the already-mounted offline model to refresh its
  current inventory, then records a bounded metadata reading in page memory.
- **Compare latest readings:** compares two explicit readings. The comparison
  is historical and does not imply that a copy remains available later.
- **Add a note / change status:** attaches a user-provided note to a listed cell.
  Closing a note does not change the cell's recorded state.
- **Export:** creates a local text summary or bounded JSON history. The user
  must choose where to save it. Text summaries contain only source metadata,
  local-state labels, timestamps, and note counts; JSON can contain notes.
- **Import:** parses a bounded JSON file for the same region. Imported readings
  remain historical; opening a file does not trigger a fresh inventory check.
- **Clear:** clears this page's history only and does not remove downloaded data.

The panel never starts a timer, a scheduled process, an automatic download, or
external storage. It uses no secrets. The code retains `UNKNOWN` for any
unreadable or inconsistent source metadata, including an inventory with an
unlisted cell or mismatching byte count. A saved-state transition is only
reported when both snapshots are otherwise aligned with the stated source.

## Integration and limits

The existing offline dashboard dynamically imports `localEvidenceTimelinePanel`
when the dashboard is mounted. An unmount invalidates pending imports and
inventory refreshes. Existing dashboard mounts and exports are preserved.

The timeline supports up to 2,048 listed cells, 12 explicit readings, 240
manual notes and 524,288 UTF-8 bytes per serialized history. Page results
are limited to 20 rows. Controls use native labels and a minimum target area
of 44 CSS pixels. The announcement region is polite and atomic. English and
French use matching fields, with French curly apostrophes and appropriate
nonbreaking punctuation. This panel does not fetch map tiles.

## Regression coverage

Tests exercise the full local-state transition matrix at each of four cell
positions, all filter/order/search combinations, source/size/date/licence drift,
invalid cell states, bounded historical notes, serialization, French copy,
metadata-only summaries, and preserved dashboard mount/cleanup.

Full-repository checks must run in a complete checkout before merge:

```
npm run lint
npm run typecheck
npm test
npm run build -w @access/web
npm run check:web-precache -w @access-main/budgets
```

Never raise the 524,288-byte individual precache file budget to accommodate
this panel. If the limit fails, split the import graph further and recheck.
