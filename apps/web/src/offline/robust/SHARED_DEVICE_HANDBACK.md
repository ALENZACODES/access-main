# Shared-device handback review

This optional panel is opened manually from the offline dashboard. It provides
a fixed checklist for reviewing a shared device before returning it. The
prompts cover account sessions, browser state, downloaded files, offline
packs, paper and external storage, and device preferences.

The review records only:
- a generated review identifier;
- the optional region identifier;
- creation and last-change timestamps;
- one status for each fixed prompt.

It does not collect free-form notes, account names, passwords, contact
details, device identifiers, or file names. Each prompt can be marked
**Not reviewed**, **Marked complete**, **UNKNOWN**, or **Not applicable**.
Required prompts determine the summary state; optional prompts remain visible
but do not block the required-item summary.

This page does not sign out of accounts, close browser sessions, delete files,
clear history, change device settings, or remove offline packs. It records
selections made by the person; it cannot inspect the external browser or
account state. An imported review is historical and does not describe the
current device state.

The review exists only in page memory. It is not saved automatically.
Import requires a pasted JSON document with the expected region identifier.
JSON and text exports require an explicit action. Exported reviews may reveal
what was reviewed and should be stored or shared carefully. Resetting the
review clears only the in-page checklist.

The panel is lazy-loaded, has English and French copy, uses native labelled
controls with 44px minimum targets, and performs no network or scheduled
work.

## Tests

The model tests cover the fixed catalogue, state transitions, required-item
summaries, UNKNOWN handling, search, filters, sorting, pagination, malformed
imports, region boundaries and round-trip exports. Panel tests cover explicit
start, status changes, filtering, import, reset, keyboard-accessible controls
and unmount cleanup. Wiring tests protect the lazy mount and no-action boundary.
