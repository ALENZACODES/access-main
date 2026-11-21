# states (P4)

Day 22 error and empty states, EN + FR, wired into the live module pages.

- `stateCopy.ts` covers the plan's six Day 22 states: no network without a
  pack, pack download failure, search with no results, journey with no route,
  finder with no results, and game load failure. Each has a plain-language
  heading, one sentence, and next actions (retry, clear the search, change the
  trip, download the pack, open help, go home). Errors are `alert`, empty
  states are `status`. Every action is at least 44 px.
- Wording fits a local PWA: no "service", "server" or "our side", and no blame.
- `StateNotice.tsx` renders a state. Link actions go to real routes
  (`/`, `/offline`, `/help`); other actions need a handler, and an action with
  neither is not shown.
- Wired in `pages/ModulePage.tsx` (`/places`, `/journey`, `/finders`,
  `/games`): no results after a search, no route after planning, offline with
  no stored pack (checked with `getPack`, never assumed), and a module that
  fails to load (the promise used to be left unhandled).
- The pack download failure copy is used by the offline pack page's recovery
  (P17).
- The shell's own states (not found, render failed, storage unavailable,
  profile save failed) stay in `shell/errorStates.ts` with `ErrorActions`.
- The "accessibility unknown" state keeps UNKNOWN as UNKNOWN.
- Tests: `states/stateCopy.test.ts`, `pages/ModulePage.states.dom.test.tsx`,
  `e2e/day22-states.spec.ts`.

## Tag and note (P4, round 12)

A closed-by-default section on the places list for places whose wheelchair tag and free-text note may point
opposite ways. Everything is read from the words of the note on this device; nothing is sent anywhere.

- `tagNoteSignals.ts`: finds access and barrier words in a note (ramp, lift, steps, stairs, step free,
  automatic door, narrow or wide with a barrier or access reading, and French equivalents). A negated word
  flips direction ("no ramp"), and words inside a phrase are counted once.
- `tagNoteCheck.ts`: only tags yes, designated and no are compared. A tag of limited or unknown is never
  flagged. Each finding is "one-sided" (all marked words point against the tag) or "mixed". It never says
  which of the tag and the note is right.
- `tagNoteMarks.ts`: splits the note into pieces that join back to the exact note, so the marked words can be
  shown in place.
- `tagNoteSpread.ts`: the compared places grouped by kind, with counts, clear cases and a share. A high share
  is not read as a worse kind.
- `tagNoteEarlier.ts`: reads a findings CSV saved by this tool (formula guard undone, bad rows counted, not
  guessed at) and lists what is new, changed, no longer or the same.
- `tagNoteCopy.ts`, `tagNoteMoreCopy.ts`: English and French wording; `tagNoteExport.ts`,
  `tagNoteSpreadExport.ts`: text and CSV files made in the browser.
- `TagNoteCheck.tsx` (with `TagNoteSpread.tsx` and `TagNoteEarlier.tsx`) is mounted in `PackPlaces.tsx` and
  shows nothing when no place has a note.
- Tests: `tagNote*.test.ts`, `TagNoteCheck.dom.test.tsx`, `TagNoteMore.dom.test.tsx`,
  `PackPlaces.tagNote.dom.test.tsx`.
