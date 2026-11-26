# The order of the places list

An optional, closed section on the places list: "Change the order of the list". It changes the order
of the places that pass the current search and filters, and nothing else. Which places are listed,
how many, and what each card says do not change.

## The eight orders

| Order | Rule |
| --- | --- |
| Default | Nearest first when a point is typed, then by name. With no point, by name. This is the order the list always had. |
| Name, A to Z / Z to A | Names compared without case or accents. An unnamed place is last in both directions. |
| Kind of place | The pack's category, compared without case, accents or underscores, then by name. No kind is last. |
| Street, then number | The street as parsed by `streetAddress.ts` (so "St" and "Street" are one street), then the civic number as a number. No street (a PO box, no address) is last. |
| Wheelchair tag | Yes, Limited, No, Designated, then UNKNOWN. This groups places by the tag the pack reports; it is not a ranking. |
| Record retrieved, oldest / newest first | The ISO date in the record's provenance. No date is last in both directions. |

**Then by.** A second order can be added (kind, then street, for example). It decides only between places the first
order cannot tell apart, and never changes the sequence of the first order's values. A second order equal to the first,
or the default, is ignored (`cleanThen`).

Ties are always broken by name and then id, in ascending order whichever direction was chosen, so the
list never changes between renders and never depends on the order the pack was written in.

## What is shown

- The order's help line says what happens to a place whose record does not state the field.
- A line says an order is only a way to find places and says nothing about one being better or easier.
- For every order except the default, a numbered list of the groups the order makes
  ("Cafe: 2 places"). Neighbouring places that share a value form one group; the check
  `runsAreContiguous` makes sure no value is split in two.
- A table with each place's position, its name and the value the order used, so the order can be checked
  by reading it. It is cut at 200 rows with a plain note; the files hold every place.
- Two saves: text and CSV, numbered in the order shown. The CSV date is ISO so a spreadsheet can sort it.

## Files

| File | What it holds |
| --- | --- |
| `packSort.ts` | The orders, `comparePlaces`, `sortPlaces`, and the groups (`sortRuns`). Pure; no React, no copy except tag and date words for group names. |
| `packSortCopy.ts` | English and French labels, help, status, and the text and CSV files. |
| `packSortKeys.ts` | The order table: `sortKeyText`, `buildOrderTable`, `orderTableNote`. |
| `PackSort.tsx` | The component. Closed until opened. Controlled: the parent holds the order. |
| `packPlacesView.ts` | `PackQuery.sort` (optional). The view orders its places with `sortPlaces`, replacing the inline sort it had. |
| `PackPlaces.tsx` | Holds the order in state, passes it to the view, and mounts `<PackSort>` before the text map. |

Tests: `packSort.test.ts`, `packSort.invariants.test.ts`, `packSortCopy.test.ts`, `packSortKeys.test.ts`,
`packPlacesView.sort.test.ts`, `PackSort.dom.test.tsx`, `PackSort.table.dom.test.tsx`,
`PackSort.keyboard.dom.test.tsx`, `PackSort.then.dom.test.tsx`, `packSort.then.test.ts`, `packSort.language.test.ts`, `PackPlaces.sort.dom.test.tsx`, `packSort.shipped.test.ts`,
`packSort.source.test.ts`, `packSort.docs.test.ts`.

## What is not claimed

- An order is not a ranking. Nothing here scores, rates or recommends a place.
- The order is not remembered: leave the page and it is the default again. Nothing is stored.
- "Nearest first" is a straight-line distance from a typed point. It says nothing about a route.
- An address is split into street and number by rules in `streetAddress.ts`. An address that does not
  fit those rules has no street for this purpose and is last, never guessed.

## Not tested by

No real screen reader and no browser end-to-end run was used for this section. Accessibility checks are
axe-core in jsdom and structural keyboard checks. The 44 px touch target is checked in the stylesheet, not
measured on a device.
