# Route states

`routeStates.ts` maps each live route to its empty state and allowed error
kinds. `getRouteError(route, kind, locale)` and `getRouteEmpty(route, locale)`
return the state view plus a `routeId` and an `ariaLabel` (route name – title).
A kind a route does not list falls back to that route's first listed kind.

| Route id | Live component | Empty state | Error kinds |
| --- | --- | --- | --- |
| `search` | `/places` (`pages/ModulePage.tsx`) | search-no-results | offline-no-pack, pack-download-failed |
| `journey` | `/journey` (`pages/ModulePage.tsx`) | journey-no-route | offline-no-pack, pack-download-failed |
| `finders` | `/finders` (`pages/ModulePage.tsx`) | finder-no-results | offline-no-pack, pack-download-failed |
| `map` | `/map` (`map/MapPage.tsx`) | map-no-places | offline-no-pack (offline only; online load failures keep the map's own message) |
| `place` | place detail | accessibility-unknown | offline-no-pack, pack-download-failed |

The map has no search box, so its empty state is about the map view and the
filters, not a search. `createRouteStates(routes)` builds the same helpers for
another route table.
