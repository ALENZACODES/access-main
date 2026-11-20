# Places by street

`StreetIndex` (inside PackPlaces) groups the places currently shown by the street in their address line, in English or French.

- `streetAddress.ts` reads one address line: number, street, direction, unit. A line that is no address, a post office box or a corner of two streets is named as such and never placed on a street.
- `streetIndex.ts` groups, orders and filters the streets, and adds a street's places to the list one by one through the existing list hook (no new storage).
- `streetIndexExport.ts` writes text and CSV.

What it says: counts and the address text as given. What it does not say: distances, which side of a street a place is on, or how usable a street is. UNKNOWN stays UNKNOWN.

Checked locally: unit, DOM (jsdom, axe, simulated keyboard) and source-scan tests, plus mutation checks. Not checked: a real screen reader, e2e, measured pixel sizes (the 44px check reads the stylesheet rule), addresses beyond the 24 shipped places and the generated lines used in the tests.
