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
