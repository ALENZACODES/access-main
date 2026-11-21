# Personal access preparation notes

This feature adds an optional, browser-only preparation notebook to the existing
Ontario offline inventory dashboard. It is for personal questions before an
outing: entrance information, route surface, washroom information, resting
places, transport, communication, contact details and local storage.

The prompts deliberately ask open-ended questions. They do not assert that a
physical place is accessible, suitable or safe. A person may write an answer,
mark a question open, leave it UNKNOWN, or mark it not needed. A named source
note requires its source name and publication date. A named source is still
only a note and not a statement about present-day conditions.

A question can refer to one cell in the current region manifest. The notebook
recomputes local-copy status from the dashboard's current inventory; it never
turns a personal answer or imported historical note into proof that a cached
cell exists. Manifest/inventory mismatch, absent or unreadable entries, stale
metadata and missing data all remain UNKNOWN. Saved local bytes never establish
conditions at a physical location.

## Privacy and interaction

- The notebook is held in page memory only. Nothing saves automatically.
- Exports require a button press. Files may contain personal notes.
- Import requires choosing a local JSON file and is restricted to 262,144 bytes.
- The public import validator checks version, region ID, dates, status and source
  semantics, bounded entries and bounded revision history.
- The notebook cannot fetch or delete offline cells, send messages, or schedule
  background operations.
- Inputs use native labels. Controls have a minimum 44 CSS-pixel target area.
- A polite status region announces the result of each explicit action.
- The panel is loaded as a separate module and has a disposal guard.

## Limits and safeguards

- Up to 120 current questions, 600 history events, 25 rows per page.
- Questions up to 240 characters, answers up to 1,600 characters.
- IDs, date formats and source fields are strictly checked.
- Source notes require a name and an ISO publication date.
- File import/export is metadata and text only, never downloaded cell payloads.
- English and French label sets are complete; UNKNOWN is not translated.
- French uses curved apostrophes and correct nonbreaking punctuation spaces.

## Integration

The barrel exports `accessPreparation`, its copy, exports and browser panel.
The existing dashboard adds an optional host and dynamically imports the panel.
All pre-existing dashboard mounts and cleanups are retained. This changes no
PWA precache policy, maximum chunk size, timeout or performance budget.

## Relevant checks

From a complete repository checkout, run:

```sh
npm run lint
npm run typecheck
npm test
npm run build -w @access/web
npm run check:web-precache -w @access-main/budgets
```

The focused model tests include a matrix of manifest positions, stored-cell
conditions and metadata drift; the copy tests cover bilingual field equality,
punctuation and UNKNOWN. Export tests cover metadata-only files and private
notes. Wiring tests protect deferred loading and teardown.
