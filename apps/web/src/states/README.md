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
