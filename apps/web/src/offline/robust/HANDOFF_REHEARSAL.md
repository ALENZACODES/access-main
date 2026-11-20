# Offline handoff rehearsal

The handoff rehearsal is a browser-only tool on the existing `/offline` page.
It takes a starting reading only after the person requests one. A second explicit
request asks the dashboard for a new inventory and compares the two observations.
The readings describe cached files on the current device, **not** the accessibility
of physical places. An observation with missing, unreadable, conflicting or
incomplete evidence remains `UNKNOWN`.

## Flow

1. Choose **Record starting inventory**. The app refreshes the current inventory.
2. Optionally add notes to listed cells; each note has a category and status.
3. Choose **Compare with current inventory** after a relevant event.
4. Search, filter, sort and paginate changes without modifying cached content.
5. Export the history and notes only if wanted. Imported files are historical,
   not evidence that the represented cells remain available on the current device.
6. Choose **Clear handoff** to discard the in-page history.

The JSON format is `offline-handoff-book-v1`; captures use
`offline-handoff-capture-v1`. File sizes are capped at 524,288 bytes; captures
are capped at 2,048 cells and the note bank at 200 notes of up to 1,000
characters each. Import validates region, format, source metadata, timestamps,
unique IDs, and note fields. No payload bytes are included in exported files.

## Privacy and operational limits

- No account, server, scheduled task, background interval or persistent note store.
- No downloaded cache content is opened, changed, deleted or transmitted.
- No inferred street-level condition, eligibility or clinical conclusion.
- Import is a user action. Imported records never silently change downloaded content.
- A lost copy means a previously recorded local file is now absent from the
  current inventory; it does not infer whether a person can travel to a location.
- Source and licence changes prevent matching historical and current evidence.
- Native controls are labelled and have a minimum 44-pixel control height/width.
- Both languages retain the literal `UNKNOWN` token.
- Text is inserted through DOM text nodes rather than trusted HTML.

## Integration

The public barrel exports `handoffRehearsal`, `handoffRehearsalCopy`, and
`handoffRehearsalPanel`. The existing offline dashboard mounts
`mountOfflineHandoffRehearsal` and calls its teardown function during unmount.
No extra route, tile request or precache entry is added.

## Checks to run in a complete repository checkout

```sh
npm run lint
npm run typecheck
npm test
```

Run existing build and asset-budget checks as defined by the current repository.
Do not relax existing offline page, download, timeout or storage limits.
