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

## Reading ease of the notes (round 10)

- `NoteReading.tsx` gives each place's note a rough reading score from sentence
  and word length (Flesch in English, Kandel and Moles in French), a band
  (easy, fair, hard, very hard), the long words and long sentences, and
  files in text or CSV. Closed until asked for; no heading; notes are shown as
  written and never changed. It does not judge whether a note is right.
- A note is read with the formula of its own language, guessed from common
  small words (`noteLanguage.ts`); with too little to go on it uses the page's.
- Notes under six words are counted as too short to score, never scored.
- Modules: `noteSyllables.ts`, `noteSentences.ts`, `noteReadability.ts`,
  `noteReadabilityIndex.ts`, `noteReadabilityCopy.ts`, `noteReadabilityExport.ts`.

## Places close together (P4, round 13)

A closed-by-default section on the places list that groups the listed places that sit close together on the map.
It uses straight-line distance only: a group is not a route, and nothing says a way between two places can be
used with a wheelchair. Everything is worked out on this device from the pack's map points.

- `walkGroups.ts`: groups places within 100, 200 or 400 metres of each other, joined end to end, with a grid
  of cells so a long list is not compared pair by pair. Places with no map point are counted and left out; a very
  long list is cut at `MAX_GROUPED_PLACES` and the cut is reported.
- `walkGroupName.ts`: names a group by the street half of its places share, else by its first named place. Never
  by a neighbourhood or district, which the pack does not give.
- `walkGroupStats.ts`: counts, filters (different tags, every tag UNKNOWN, two or more UNKNOWN, a place tagged no)
  and orders. None of them ranks a group as better or worse.
- `walkGroupLinks.ts`: for a group of up to 400 places, the places whose absence would split the rest of the
  group (shown as where a group is thin), each place's nearest neighbour and the closest pair.
- `walkGroupCopy.ts`, `walkGroupExport.ts`: English and French wording, and text and CSV files made in the
  browser (coordinates written as plain numbers, so a negative longitude is not given a formula guard).
- `WalkGroups.tsx` is mounted in `PackPlaces.tsx` and shows nothing when fewer than two places have a map point.
- Tests: `walkGroup*.test.ts`, `WalkGroups.dom.test.tsx`, `PackPlaces.walkGroups.dom.test.tsx`.

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
