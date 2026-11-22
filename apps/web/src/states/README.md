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
