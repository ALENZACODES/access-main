# states routes (round 2)

`index.ts` is the package entry for this folder; import from `./states` (or `./index` in tests), not from the individual files.

- `routeStates.ts` applies the state components to routes: `ROUTE_STATES` declares, per route (`search`, `place`, `saved`, `map`), its empty state and allowed error kinds. `createRouteStates(routes)` builds the same helpers for the app's own route ids and labels (the default four are placeholders to rename); `getRouteError(route, kind, locale)` and `getRouteEmpty(route, locale)` return the state view plus `routeId` and an `ariaLabel` (route name – title). Unlisted error kinds fall back to `unknown`; unknown routes get the generic error and no empty state.
- The `place` route's empty state stays UNKNOWN; nothing is inferred about accessibility.
- Only new user strings are the four route names (EN + FR). No data sources, so no licence or date to record.
- Depends on `stateCopy.ts` from round 1.
- Test: `vitest run apps/web/src/states`.
