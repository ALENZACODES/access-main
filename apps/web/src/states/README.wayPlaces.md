# Places along a straight line

A person types a first point, a second point and up to three points in between. The places on
screen are measured against the straight lines joining them and listed in order from the first
point. Closed until asked for; it adds one `h3` only when open.

## What it does

- Measures how far along the path each place's nearest point is, and how far off the path the
  place is (`wayPlaces.ts`). The band has rounded ends: a place just before the first point or
  just past the second counts when it is within the width of that point.
- Widths of 100 m, 250 m, 500 m and 1 km; a filter by the pack's OpenStreetMap wheelchair tag,
  with UNKNOWN shown as UNKNOWN in both languages; 10, 25 or 50 rows on the page.
- Names the longest part of the path with no listed place near it, and in the text file every
  part of 500 m or more. This is where the list has nothing, not proof that nothing is there.
- Swaps the ends (points in between keep their place on the path) and offers the near-me point as
  the first point.
- Saves text, CSV (formulas made plain text) and GeoJSON (`wayPlacesExport.ts`). The CSV and the
  GeoJSON give the part of the path each place is nearest when there is more than one.

## What it does not do

- A straight line is not a route. It does not follow streets or paths, and a place near the line
  is not on a step-free way. The copy says so where the list is shown and in every file.
- Two points that follow each other at the same place, and paths over 50 km in all, are refused
  with a reason instead of being measured.
- Places with no map point are counted and listed as UNKNOWN, never placed.
- Nothing is stored or sent; the points live in the component until the page closes.

## Files

`wayPlaces.ts`, `wayPlacesCopy.ts`, `wayPlacesExport.ts`, `WayPlaces.tsx`, mounted in
`PackPlaces.tsx` after the meet-up tool. Tests: `wayPlaces.test.ts`, `wayPlacesCopy.test.ts`,
`wayPlacesExport.test.ts`, `WayPlaces.dom.test.tsx`, `PackPlaces.wayPlaces.dom.test.tsx`.

Distances use a flat projection around the middle of each part. For paths up to 50 km, the
difference from great-circle distances is checked in the tests to stay within half a percent
for city-length lines.
