# P20L: provenance and uncertainty in rendered records

`p20l-live.spec.ts` is discovered by the existing Playwright E2E runner. It
visits the shell routes using the same Day 17 route and language helpers as
the axe sweep, at 320 and 1280 CSS pixels in English and French. It also
checks the visible page when the browser goes offline without reloading.

The audit reads the rendered `.result-items` lists. When a record shows a
metadata list, its four fields (source, licence, date and tier) must have
matching `dt` and `dd` elements. Known date values must be actual ISO
calendar dates, and known licences must be on the recognized open list.
An absent value is **UNKNOWN**, not an inferred accessible facility.
Records with no evidence list are not counted as known facts.

`p20l-provenance.spec.ts` exercises failure mutations of these contracts:
missing labels, duplicate fields, unsupported licences, impossible dates,
empty cards, future dates, and route inventory defects. New route additions
do not require an expected numerical route count to be updated.

These automated checks do not establish that any physical location is
accessible. They also do not replace manual WCAG 2.2 AA testing with
assistive technology. No data packs, credentials or third-party services
are shipped by this test suite.
