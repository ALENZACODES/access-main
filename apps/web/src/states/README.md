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

## Language of the names (P4, round 15)

A closed-by-default section on the places list that checks each name for everyday French or English words ("rue",
"bibliothèque", "library", "school"). It is a guess from common words and says so: a name made of a person's name,
a brand or a town points to no language, and nothing here says what language a name is in or changes a name.

- `nameLexicon.ts`: the word lists, folded (lower case, no accents). A word both languages use ("centre", "place",
  "hotel", "route", "municipal") is in neither list.
- `nameLanguage.ts`: splits a name into words (hyphens and apostrophes split; "l'" and "d'" count as French),
  checks the alphabet (a name mostly in another alphabet is set aside), counts French-only letters, and marks a
  name that is a French half and an English half split by a slash or bar.
- `nameLanguageReport.ts`: runs the reader over the list, filters (a reading, pairs, accented names with no word
  that points to a language), orders, lists the kinds of place behind a reading, and gives whole-number shares.
- `addressLanguage.ts`: the same reading for the street part of an address (the street type and a direction after it
  only, so "St. Clair Avenue" is not read by its "St"), and a comparison of what a name and its address point to.
  "avenue" and "est" are in neither list. A place whose name and address point to different languages is a
  filter choice, not a fault.
- `nameLanguageKinds.ts`: a table of kinds of place against what their names point to, counts only, UNKNOWN last,
  with its own CSV file.
- `nameLanguageCopy.ts`, `nameLanguageExport.ts`: English and French wording, and text and CSV files.
- `NameLanguages.tsx` is mounted in `PackPlaces.tsx` and shows nothing when no place has a name.
- Tests: `name*.test.ts`, `NameLanguages.dom.test.tsx`, `PackPlaces.nameLanguages.dom.test.tsx`.

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
