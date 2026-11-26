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
- Spot-check sheet (`PackSpotCheck.tsx`, mounted in `PackPlaces.tsx`): picks a
  few of the places on screen to look at in person, from a seed, so the same
  places and seed give the same list on any device (`spotRandom.ts`,
  `spotSample.ts`). The sheet (`spotSheet.ts`, `spotSheetExport.ts`: page, text,
  CSV) puts what the pack reports next to the same five questions for every
  place. It never says a place is accessible and never says the pack is right or
  wrong. Nothing written on the sheet is read, kept or sent, and no storage key
  is used.
- Tests: `states/stateCopy.test.ts`, `pages/ModulePage.states.dom.test.tsx`,
  `e2e/day22-states.spec.ts`.

## Saved-places fingerprint (P4, round 7)

Two devices can tell whether they hold the same saved places without sending
the places anywhere.

- `sha256.ts` is a plain SHA-256 (same answer on every device, no secure
  context needed). `packCanonical.ts` gives each record one fixed text form;
  `packFingerprint.ts` hashes the whole pack, the ids alone, and 16 groups
  chosen by a hash of the id.
- `packFingerprintCode.ts` writes and reads the `PACKFP v1` code. It has a
  check value, so a mistyped or cut code is refused rather than compared.
- `packFingerprintCompare.ts` says: same, same ids with different details, or
  different places, and which groups differ.
- `packGroupDetail.ts` narrows a difference to ids: a `PACKGRP v1` code lists
  one short hash per place in the groups that differ, and pasting the other
  device's code shows only-here, only-there and changed ids.
- `PackFingerprint.tsx` and `PackGroupDetail.tsx` are closed by default and add
  no heading. They are mounted in `PackPlaces.tsx` after the list transfer.
- A match means the saved records are the same on both devices, as read. It
  never says they are correct or up to date. Codes hold counts, ids and hashes:
  no names, notes, addresses or locations. No new storage key is used.

## Call script (round 9)

- `CallScript.tsx` writes a script for phoning one place, from what the pack
  holds: an opening, the name (hard words spelled with the English or French
  spelling alphabet), the address read in words, the visit questions with their
  reasons and room to write, and a closing with fields for who, when and a
  call-back date. Closed until asked for; no heading; nothing is dialled,
  sent or stored.
- Where the pack has no name, no street, or only a box or a corner, the script
  says so and tells the caller to ask, and never fills the gap.
- `numberWords.ts` (0 to 99 999, English and French rules), `spellOut.ts`,
  `callScript.ts`, `callScriptPick.ts`, `callScriptExport.ts` (text and a
  printable page), `speak.ts` (the browser's own voice, injected for tests).
- Tests: one `*.test.ts` per module, `CallScript.dom.test.tsx` and
  `PackPlaces.callScript.dom.test.tsx`.
## Possible repeats (round 11)

- `PossibleRepeats.tsx` looks for places of the pack that may be one place
  listed twice, from name (accents, case, articles and spelling variants
  ignored, small slips allowed), street address, distance and kind. It goes
  further than `packDuplicates.ts`, which only pairs the same folded name within
  75 m for the data report.
- Position and kind alone never make a pair; a name or street must also be
  alike. Pairs come from buckets (same address, same name, same patch of
  ground), a bucket over 40 places is skipped and counted, and groups are made
  by joining pairs.
- It points and says why. It merges, hides and removes nothing, and says it
  cannot tell which record is right. A group whose members report different
  wheelchair tags is marked.
- Modules: `textSimilarity.ts`, `placeNameKey.ts`, `duplicateScore.ts`,
  `duplicateGroups.ts`, `duplicateCopy.ts`, `duplicateExport.ts`.

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
