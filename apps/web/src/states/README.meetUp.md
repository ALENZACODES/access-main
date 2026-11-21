# Places for two people to meet

Shown on the places list, closed to begin with, when two or more places are on screen. It is for two people who start from different points and want to see which places are not far from either.

- **Two points.** Typed as latitude and longitude (a French decimal comma is accepted). A button copies the near-me point into the first point. Nothing is read from the device's location.
- **Distances** are straight lines between map points (great-circle), in whole metres. They are not routes: they ignore streets, crossings, slopes and closures. A place with no map point is set aside and listed as UNKNOWN.
- **Orders.** "Balanced" puts first the place whose longer distance is smallest (ties: smaller total). "Shortest total" adds the two distances. "Nearest to the first point" and "Nearest to the second point" use one distance only. Ties go to the name (an unnamed place last), then the id, so the same input always gives the same order, whichever way round the places came in. Swapping the two points swaps the roles of the last two orders.
- **Halfway** is the average of the two points to five decimals, taken the short way across the date line.
- **Shown** are the first 5, 10 (default) or 25 places; the note says how many are left out. The saved files hold every placed place.
- **Pace** (optional, one for each person, typed, never stored) adds the least number of minutes a straight line would take, rounded up, in two more columns. Times say nothing about streets, crossings, slopes or waiting.
- **Saved files** (made on this device): text, CSV and GeoJSON (the two points, halfway and each placed place, with the OpenStreetMap credit). The CSV keeps numbers as numbers and has the columns position, place, id, metres from each point, longer distance, total, difference and nearer.
- **Not kept.** The points and choices live in memory and are gone when the page closes: nothing is written to storage or sent.
- **Not a recommendation.** No sentence says a place is good, open, reachable, safe or accessible, and a short distance says nothing about a step-free way there. The wheelchair tag is not used here at all.

Files: `meetUp.ts` (distances and orders), `meetUpCopy.ts` (words, text and CSV), `meetUpTime.ts` (paces and minimum minutes), `meetUpGeo.ts` (GeoJSON), `MeetUp.tsx`; mounted from `PackPlaces.tsx`.
