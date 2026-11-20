# Outing planner

Shown under the shortlist on the places list when two or more places are listed.

- **Order.** "As added", "Nearest next" (start at the place nearest the starting point, then the nearest place left; a simple rule, not the shortest tour) or "My own order" set with Up and Down buttons. A tie goes to the smaller id so the same input always gives the same order.
- **Distances** are straight lines between map points (great-circle). They are not routes: they ignore streets, crossings, slopes and closures. A place with no map point has no distance; that stays UNKNOWN and the total says it leaves those out.
- **Pace** (optional, typed, never stored) gives a minimum time along a straight line, rounded up.
- **Saved files** (made on this device): text, CSV and GeoJSON. Text and GeoJSON end with the OpenStreetMap credit. CSV keeps numbers as numbers; text that starts like a formula is defused.
- **Not kept.** The order choice lives in memory and is gone when the page closes: it writes nothing to storage and sends nothing. (Keeping it would need a row in the privacy storage register.)
- Nothing is ranked. No sentence says an order, place or trip is better, easier, safer or possible.

Files: `outingPlan.ts` (order and legs), `outingPace.ts`, `outingCopy.ts`, `outingExport.ts`, `OutingPlanner.tsx`; mounted from `PackPlaces.tsx`.
