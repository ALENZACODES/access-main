# Text map and distance table

Two read-only views of the places a pack lists, for people who cannot use or do not want a visual map.

- **TextMap** (inside PackPlaces): a 2×2, 3×3 or 4×4 grid, or "which way from my point", written as a table and sentences. Save as .txt or CSV.
- **DistanceMatrix** (inside Shortlist): straight-line distance and direction between every pair of shortlisted places. Save as .txt or CSV.

Rules kept: a place with no map point is never placed or measured (UNKNOWN); distances are straight lines and say so; no ranking, no advice; EN/FR; no storage, network or geolocation.

Checked locally: unit, DOM (jsdom, axe, simulated keyboard) and source-scan tests. Not checked: a real screen reader, e2e, measured pixel sizes (the 44px check reads the stylesheet rule).
