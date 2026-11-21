# Reaching controls by keyboard or switch

A panel on `/dev/narrow`, after "Look by hand". It counts the presses it
takes to reach each control of the page with the Tab key, or with a switch
that steps through the same order, starting at the top of the page.

## What it shows

- The number of keyboard stops on the page, and the presses to go through
  all of them.
- The presses to reach the first control of the main content, from the top
  and through a skip link when there is one among the first 3 stops.
- Where each part of the page (each landmark) starts, and how many stops it
  holds.
- A table of the stops, 25 at a time, with a field to find a control by part
  of its name.
- Notes for the team: a long way to the main content (more than 10 presses),
  a skip link that leads elsewhere than main, no skip link, positive
  tabindex, controls with no size, and a page read only in part.
- Once the person types the interval of their switch scan (0.2 to 10
  seconds), the time an automatic scan takes to reach each stop. Until then
  the time is UNKNOWN.
- A button to copy the counts as plain text.

## How the order is worked out

`reachInPage` (reach-inpage.ts) reads the page and moves no focus. It
follows the order browsers use: positive tabindex first, in increasing
order, then the rest in document order. It leaves out what cannot take focus
by Tab (disabled, tabindex -1, a link with no href, hidden, inert,
`display:none`, a closed `details` except its summary), keeps one stop per
group of radio buttons (the checked one, or else the first), and leaves out
the panel itself. A control with no size stays a stop, since it takes a
press, and is counted apart.

A press is one Tab, or one Enter on a skip link. Through a skip link the
count is: the Tabs to the link, one Enter, then the Tabs from the place it
points to. When that place can take focus itself, the Enter puts focus on
it. When the page has a positive tabindex, Chromium goes on from that place
in an order that mixes the two, so the presses through the link are left
UNKNOWN.

## What was checked, and what was not

- Unit tests: reach.test.ts, reach-panel.test.ts; jsdom: reach-inpage.dom.test.ts
  and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-reach.test.ts (with `NARROW_E2E=1`): on test pages in Chromium, the
  order worked out equals the order of real Tab presses, and the presses
  through a skip link equal the real ones. The panel states have no measured
  failure under the browser checks of this module.
- e2e/narrow-reach.spec.ts: on the built app at 320 pixels, the order given
  for a control is the number of Tab presses that reach it.

Not checked: other browsers, screen readers, and real switch software. A
switch that scans by rows or groups may take fewer steps than counted here.
The counts do not say whether a page is easy to use.
