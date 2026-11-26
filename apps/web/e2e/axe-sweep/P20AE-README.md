# P20AE — Responsive reflow and text-spacing resilience

This round audits layout continuity as the viewport narrows, widens, rotates
and receives text-spacing stress. It is distinct from the previous route
history and form-validation work.

Included source contracts cover CSS-pixel viewport geometry, horizontal
overflow, 44px interactive targets, content clipping, focus reachability,
visual reading order, breakpoint navigation, fixed/sticky obstruction,
text-spacing stress and matrix reconciliation.

Playwright coverage includes English/French 320px journeys, multiple viewport
widths, portrait-to-landscape changes, keyboard traversal, text-spacing stress
and axe scans. Synthetic fixtures test breakpoint behavior independently of
the product shell.

All browser observers are read-only. Stress styles are explicit and test-only.
No app storage, network calls, service worker, cron or real-place accessibility
facts are introduced.
