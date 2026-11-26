# Coordinate precision audit (P10-lc)

What it checks: the places in `apps/web/src` where a coordinate is turned into text or a file, and how many decimals
are written. Five decimals is about 1.1 m on the ground, so more than that is a finding. A coordinate written as it
is (`String(p.lat)`, a template, a `[lon, lat]` pair) is also a finding, because its number of decimals is whatever
the number holds. Each finding needs a row in `lcRegister.ts` with a reason, or the audit fails. Rows that no longer
match anything also fail.

Files: `lcMask.ts` (blanks comments, strings and regexes), `lcText.ts` (finds coordinates in written text),
`lcScan.ts` (finds the sites in source), `lcRules.ts` (codes, compare, validation), `lcRegister.ts`, `lcReport.ts`,
and the `lc.*.audit.test.ts` files (real tree, real exporters, fuzz).

Codes: `lc-raw`, `lc-too-fine`, `lc-variable-digits`.

## What the real tree shows (read, not assumed)
- Cut to 4 or 5 decimals: GPX, vCard, `geo:` link, place sheets, meet-up text, pack diff, pack text.
- Written as they are, accepted with reasons: pack CSV (`packRow`), outing CSV and GeoJSON, meet-up GeoJSON points
  typed by the person (up to 8 decimals), the near-fields on the pages, and one map pan call.
- No site cuts to more than 5 decimals.

## Known, recorded by tests that fail when changed
- `packRow` writes 12-decimal input in full while `packPlaceToText` writes 4 for the same place.
- `meetUpToGeoJson` writes typed points in full while `meetUpToText` rounds to 5.
- Outing CSV and GeoJSON write a stop's point as given.

## Not checked
- Whether the places those numbers come from are already coarse; only the writing is audited.
- Coordinates written by code the scanner cannot see: a bare `[lon, lat]` of plain names (so `MapPage.tsx:135` is
  not seen), numbers built by string joins, or other files outside `apps/web/src`.
- Whether a person's typed point is something they want kept; only that it is written as typed.

`lcMask.ts` copies the design of `tmMask.ts`, which is on a branch that is not merged yet; merge them when it is.
