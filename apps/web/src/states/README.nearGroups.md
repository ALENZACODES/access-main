# Places close together

An optional, closed section on the places list. It answers two plain questions about the places that
are currently listed (every filter and search already applied):

1. **Which of these places lie close together?** Places with a map point are linked when two of them
   are no further apart than a chosen distance (50, 100, 250 or 500 m), in a straight line. Every chain
   of links is one group. Places linked to nothing are listed as "on their own".
2. **Which place is nearest to each place?** One row per place with a map point: its nearest other
   place, the straight-line distance and the compass direction, plus how many places have a neighbour
   within each of the four distances.

It is counting and measuring only. It does not say a person can get from one place to another, it
does not rank places, and it does not say anything about how accessible a place is. The page says so
(`nearCaveat`) and the tests check the wording.

## Files

| File | What it holds |
| --- | --- |
| `nearGroup.ts` | The four distances, `buildNearGroups` (single linkage over a latitude-sorted window plus a union-find), `spanOf`. No React, no copy. |
| `nearNeighbour.ts` | `buildNeighbours` (nearest other place per place, counts per distance) and `groupMiddle` (average of latitudes and of longitudes, five decimals). |
| `nearCopy.ts` | English and French sentences for groups, the text file and the CSV. |
| `nearNeighbourCopy.ts` | The same for the nearest-place view, plus `pointText`. |
| `NearGroups.tsx` | The component. Closed until the person opens it. Two views, a distance choice, two saves per view, and "Use the middle of Group N as my point". |
| `PackPlaces.tsx` | Mounts `<NearGroups places={view.shownPlaces} onUsePoint=… />` after the text map. |

Tests: `nearGroup.test.ts`, `nearNeighbour.test.ts`, `nearCopy.test.ts`, `nearNeighbourCopy.test.ts`,
`near.invariants.test.ts` (eight seeded layouts, every distance), `near.language.test.ts` (every mix of groups, loners and places with no point, in both languages), `near.docs.test.ts` (this file and the wiring), `NearGroups.dom.test.tsx`,
`NearGroups.nearest.dom.test.tsx`, `NearGroups.keyboard.dom.test.tsx`,
`PackPlaces.nearGroups.dom.test.tsx`, `nearGroups.shipped.test.ts`, `near.source.test.ts`.

## How a group is formed

Single linkage: if A is within the distance of B and B is within the distance of C, A, B and C are one
group even when A and C are further apart than the distance. So a group's **span** (the largest
distance between any two of its places, whole metres) is shown with it. A long chain of shops along a
street is therefore not presented as a tight cluster.

Places are sorted by latitude and each place is compared only with later places whose latitude is
within `distance / 111,000` degrees, so large packs do not need every pair compared. The invariants
test and a brute-force test check the result against the full pairwise comparison.

Order of the input never changes the result: ids, names and groups are sorted (name, unnamed last, then
id) and groups are listed largest first, then tightest, then by first id.

## What is not claimed

- Straight line only. A road, a river, a rail line, a fence or a steep slope can make two places that
  are 50 m apart a long way apart on foot or on wheels.
- A place with no usable map point is listed as UNKNOWN. It is never given a guessed position and never
  counted as close to anything.
- The middle of a group is an average of coordinates. It may not be a place a person can stand.
- Distances use the haversine formula in `packGeo.ts`, which treats the Earth as a sphere. That is
  accurate to well under 1 % over these distances.

## Files the person can save

Text (`places-close-together.txt`, `lieux-proches.txt`, `nearest-places.txt`, `lieux-les-plus-proches.txt`)
and CSV with a byte order mark, same names with `.csv`. Cells that a spreadsheet could read as a formula
are prefixed with an apostrophe (`csvCell`). The CSV has metres as a plain number.

## Tested not by

No real screen reader was used and no browser end-to-end run was made for this section: the accessibility
checks are axe-core in jsdom and the keyboard checks are structural. The 44 px touch target is checked in
the stylesheet, not measured on a device.
