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

## Wording of names and addresses (P4, round 14)

A closed-by-default section on the places list that points at names and addresses written differently from what a
reader may expect. It reads the text as the pack gives it, says what it saw, and never says the text is wrong or
changes it. A pack may write a place this way on purpose.

- `writingRules.ts`: thirteen rules, seven for names and six for addresses: all capitals, all lower case, a phone
  number, e-mail or web address, a name that looks like an address (a leading number and a street word, so "7 Eleven"
  is not one), punctuation at the edge, a repeated word, a name equal to the address, a postal code or province inside
  the address, a street with no number. Scripts with no upper or lower case are never flagged for case.
- `writingStyle.ts`: a street type written two ways in the list ("St" and "Street"). Only the last word of the street
  part counts, so "St. Clair Avenue" is an avenue. At least four addresses of a type are needed, and the places using
  the less common form are pointed out.
- `writingReport.ts`: runs the rules, then filters (names, addresses, street-type mix, or one rule) and orders.
- `writingCopy.ts`, `writingExport.ts`: English and French wording, quoting the text seen, and text and CSV files.
- `WritingCheck.tsx` is mounted in `PackPlaces.tsx` and shows nothing when no place has a name or an address.
- Tests: `writing*.test.ts`, `WritingCheck.dom.test.tsx`, `PackPlaces.writing.dom.test.tsx`.
