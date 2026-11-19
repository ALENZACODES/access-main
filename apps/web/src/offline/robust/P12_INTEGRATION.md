# P12 offline panel integration

The existing `/offline` page mounts the dashboard through the first-party pack client.
This package retains every existing control and wires five additional independent,
read-only or explicitly user-initiated panels: source ledger, transfer checklist,
browser storage durability, readiness review, and offline diagnostics. Each panel
unmounts with the dashboard. No background fetch, timer or scheduled workflow is
added. No remote report export or third-party map endpoint is introduced.

Cell provenance comprises source, open licence and source date. Documentation
tiers are explicit: absent tiers remain `UNKNOWN`, as do cells without an
accessible local record or with contradictory metadata. A stored cell never
asserts that a physical place is accessible. French user-facing status uses
exactly `UNKNOWN`, the same token as English. All actions use native labelled
controls meeting the 44 CSS-pixel minimum.

The checklist import reads metadata only, and never writes pack content. The
browser storage durability control asks for permission only after activation.
Storage quota estimates are advisory. No medical or eligibility guidance is
provided. The regression tests fail if a barrel export, dashboard mount, or
cleanup call disappears during a subsequent update.

Apply these complete files to the pinned current main branch. Preserve all
other files on main. Run `npm run lint`, `npm run typecheck`, and `npm test`
from the repository root after installing locked dependencies.
