# Device-local offline session comparison

The existing offline dashboard mounts the comparison panel directly. The
person explicitly saves a starting reading, then explicitly requests a second
reading. There is no scheduled scan, external service, account data, or
background network request. The snapshot stays in memory and is discarded
when the panel unmounts or the user clears it.

Each reading includes only listed cell identifiers, declared byte counts,
source, open licence, source date, and local offline state. It never includes
location coordinates, pack payloads, or personal device identifiers. The
comparison uses the current region manifest, not a guess about nearby places.

A newly saved cell requires two consistent readings: the same manifest
metadata, an initial UNKNOWN state and a later saved state with matching
metadata. Missing inventory, a duplicate cell, an unlisted cell, a changed
manifest, and an unreadable record prevent an affirmative comparison.
The report shows UNKNOWN for insufficient evidence. A copied pack does not
establish the physical accessibility of any place.

Native controls are keyboard operable and at least 44 × 44 CSS pixels.
Status messages are polite live updates. Search, state filters, and capped
pagination do not mutate storage or start downloads. Explicit text and JSON
exports contain source/licence/date metadata and are generated locally.
English and French strings use the same keys, with French nonbreaking
spacing in reports. The existing offline dashboard remains the only route
integration point.

Tests: `sessionComparison.test.ts` and `sessionComparisonExport.test.ts`.
Run `npm run lint`, `npm run typecheck` and `npm test` from repository root.
