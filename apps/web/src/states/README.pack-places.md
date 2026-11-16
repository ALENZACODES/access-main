# states: places from the stored offline pack

The places page (`/places`, `pages/ModulePage.tsx`) shows `<PackPlaces>` under its results when the offline pack named `toronto` is stored on this device. Reading only: nothing is written or sent.

- `packPlaces.ts` reads the pack's `places` array defensively. A record with no safe id, or a repeated id, is dropped and counted. A tag counts as reported only with a usable source: a source name, an open licence from `OPEN_LICENCES` and a real retrieval date. Otherwise it is UNKNOWN, and the card says the source was unusable. A source link is kept only if it is https.
- The pack carries one OpenStreetMap `wheelchair` tag per place. It is shown as that tag, "(reported)". It is not mapped onto the six specific details (step-free entrance, elevator and so on), because the tag does not say which of them is true.
- `packPlacesView.ts` searches name, address and kind, filters by tag, and can sort by distance from a typed point (`packGeo.ts`, not stored). A tag filter never hides UNKNOWN places silently: the list says how many are not shown and to choose UNKNOWN to see them.
- `PackPlaces.tsx` is the React component. A pack with no usable places shows the new `pack-unreadable` error (search route), not "no matches".
- The pack's free-text note is shown as "Note from contributors" and is never interpreted.

Tests read the pack file shipped in `public/packs/toronto/content.json`, so a pack change that breaks a rule fails here.
