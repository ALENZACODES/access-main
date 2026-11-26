# Venues by name

`VenueGroups` (inside PackPlaces) groups the places currently shown into venues by their names, and each card says when its place is one part of a venue in the pack.

- `venueName.ts` reads a name: the base name (brackets, part words such as entrance, elevator, parking, washroom, ramp, link words and a leading article removed; English and French) and the kind of part.
- `venueGroups.ts` groups places with the same base name that, when both have a map point, are within 200 m (chained); places with no map point join only when the name leaves one possible venue and are marked "name only"; same-name places far apart are not merged and are reported. It also orders, filters, counts tags by part kind, and writes the card note.
- `venueExport.ts` writes text and CSV.

Says: names, counts, tags exactly as the pack gives them, straight-line distances. Does not say: that an entrance leads to a place, that one part's tag applies to another, or any route. UNKNOWN stays UNKNOWN.

Checked locally: unit, DOM (jsdom, axe, simulated keyboard), generated-input and source-scan tests, plus mutation checks (the 200 m boundary is not pinned by an exact-distance test). Not checked: a real screen reader, e2e, measured pixel sizes, names beyond the 24 shipped places and generated ones.
