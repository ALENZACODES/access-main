# states: place details, provenance, offline (round 3)

All exports come through `index.ts`. A route component for a place page should call `placeRouteView(load, { locale, connectivity, today })` and render the returned `content`, `empty` or `error` view.

- `provenance.ts`: every detail needs a source, an open licence (CC0, CC BY, CC BY-SA, ODbL, Open Government Licence – Canada or Ontario) and a retrieval date. `validateProvenance` rejects anything else.
- `dataStatus.ts`: a detail without valid provenance is shown as UNKNOWN. Unrecognised values are UNKNOWN. Wording is "reported", never "verified".
- `placeSummary.ts`: one row per detail with source line, age and a 44px "show source" control. No overall score or badge. Details older than 365 days get a notice.
- `offline.ts`: connectivity reducer, a monitor over online/offline events, and a banner that says when data was saved on the device.
- `placeRoute.ts`: combines the above for the place route; falls back to the UNKNOWN empty state when nothing is validly reported. `PlaceDetailPage` (`/places/:id`) uses it for not-found and load errors, and shows the offline banner and saved-copy notice when a record is on the device.
- `typography.ts`: French typography (’, U+00A0 before ":", U+202F before ; ! ? and inside « »).
- `copyLint.ts`: blocks "verified", real-time, partnership, certification and AI wording, and checks French typography. `copyLint.test.ts` runs it over every string this package can produce.

No data is bundled. Licence ids are SPDX-style identifiers for the open licences named above.
