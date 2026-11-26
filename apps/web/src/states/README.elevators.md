# Saved elevator notices

The pack stored on this device holds copies of an operator's elevator outage notices
(`elevator_status`). This view shows them station by station, each in the operator's own words,
with what could be read from the words beside them, how long ago they were last checked, and where
they came from. It is mounted on the places page (`pages/ModulePage.tsx`) and reads the pack from
the same stored copy as the places list. Nothing is fetched.

It never says an elevator works. Every age line says "saved copy", and the lead says the notices are
not live, may be out of date, and that the person should check with the operator.

## Files

| File | What it does |
| --- | --- |
| `packElevators.ts` | `parseElevatorNotices(input)` reads the pack's records without trusting them. A record with no safe id or a repeated id is dropped and counted. A record with parts missing is kept, with those parts null. `readInstant` and `readHttpsUrl` are the two strict readers. |
| `elevatorRead.ts` | `readNotice(notice)` reads the elevator label, "out of service" or "back in service", the reason "maintenance" and the phrase after "between", in English or French. Anything else is left null. |
| `elevatorAge.ts` | `noticeAge` counts whole days from the UTC day of the check to a `today` the caller gives, and puts them in a band: same day, 1 to 3, 4 to 7, older, future, unknown. `ageLine` words it. |
| `elevatorView.ts` | `viewElevators` applies a search, an age filter and a sort, and groups by station. |
| `elevatorCopy.ts` | English and French words. |
| `elevatorExport.ts` | A plain-text page and a CSV file, both with UNKNOWN for what a notice does not state. |
| `ElevatorNotices.tsx` | The section. |
| `elevatorFixtures.ts` | Test notices. Not used by the app. |

## Rules that keep it from guessing

- The operator's words are always shown in full, unchanged, in a paragraph of their own, with the
  language marked on it when the pack says it differs from the page.
- The "between" phrase is kept whole. Stations join places with commas and "and" in ways that cannot
  be told apart from a place with "and" in its name ("GO and YRT bus platform"), so it is never
  split into a list.
- An elevator label must contain a digit, so a plain word is never taken for one.
- A reason is read only when the notice gives one of the known wordings.
- A notice whose words fit no known form is shown as written with a note that it was not read into
  parts.
- A check time with no zone, or one that is not on the calendar or the clock, is not a time. A check
  after today is shown as a date that cannot be right, never as fresh.
- The age is counted in UTC days, so the same notice and the same `today` give the same answer on
  every device.
- A source address is kept only if it is https.
- A tier is shown only when the record states one. It is never defaulted.

## The page

Closed by default: a button opens the search, the age filter, the order and two save buttons
(text and CSV). They add no heading while closed or open. The count is a polite live line, not a
`role="status"`, so the page's own status line stays the only one. Station names are level 3
headings under the level 2 heading. A saved file is made in memory by `saveTextFile` and named for
the day.

## Tests

- `packElevators.test.ts`, `packElevators.fuzz.test.ts`: the shipped pack, every kind of damaged
  record, the time and address readers against the platform's own parser, and a check that what
  comes out is usable by every later step.
- `elevatorRead.test.ts`: the three shipped notices, labels, states, reasons, French, what is not
  read, and safety on random and long text.
- `elevatorAge.test.ts`, `elevatorView.test.ts`, `elevatorExport.test.ts`, `elevatorCopy.test.ts`.
- `ElevatorNotices.dom.test.tsx`: the section, the tools, searching, saving, axe in both languages.
- `pages/ModulePage.elevators.dom.test.tsx`: the wiring on the places page.
- `elevator.source.test.ts`: no network, storage or randomness, no live or verified wording, French
  typography, and no rewording of the notice text on its way to the page.
