# Places around a place

`AroundPlace` (inside `PackPlaces`) lists the pack places within 100, 250, 500 or 1,000 m of one chosen pack place. For each it shows the straight-line distance, one of eight compass directions and the wheelchair tag the pack gives it. Counts by distance band and by direction sit below the list.

- Straight lines on the map only: it says nothing about the way between two places.
- Places with no map point cannot be the centre and are counted apart, never placed.
- Files (.txt, .csv) are made on this device from the places shown; the centre is a pack place, never the person's position. No storage key, no network call.
- Modules: `aroundBearing`, `aroundSearch`, `aroundRings`, `aroundFilter`, `aroundCopy`, `aroundExport`, `AroundPlace.tsx`; `aroundFixtures.ts` is for tests only.
