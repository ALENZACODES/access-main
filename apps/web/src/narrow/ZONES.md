# Screen zones I can reach

A panel on `/dev/narrow`, between "Button size for my taps" and "Look by
hand". The window is cut into a grid of 3 columns and 4 rows. The person
marks the zones they can reach with the hand, finger, stylus or pointer
they use. The panel then lists the controls of the page that cannot be
brought into a marked zone, even by scrolling.

## How a control is placed

`zonesInPage` (zones-inpage.ts) reads the box of each control at the
current scroll, whether it sits inside something fixed or sticky (sticky is
taken as fixed), the window size and how far the page can scroll. It reads
only: it does not scroll and moves no focus. It leaves out hidden, disabled
and inert controls, controls with no box, and the panel itself. Controls
placed above or to the left of the page, where no scroll can bring them
(such as a skip link that shows only on focus), are left out and counted
apart.

`zones.ts` uses the centre of each control:

- A control that stays in place is in the zone of its centre.
- A control that scrolls can be brought up or down, as far as the page
  scrolls, but never sideways. It counts as reachable when its centre can
  be brought into a marked row of its own column.
- A control past the edge of the window, or one that stays in place outside
  it, cannot be reached.

So the result does not depend on how far the page is scrolled when it is
read. It does depend on the window size and the zoom, and the panel says so.

Three buttons mark a set of zones in one press (the bottom half, the left
column or the right column), in place of the zones marked before, so a
person who uses a switch or tires quickly needs fewer presses.

After a check, a table laid out like the grid gives the number of controls
each zone can take, whatever was marked, and names the zone that can take
the most. It can help a person see which zones the page uses most.

With no zone marked, or no window size, the result is UNKNOWN. The marked
zones go into the barrier text of the fit panel, after the screen settings.

## What was checked, and what was not

- Unit tests: zones.test.ts, zones-panel.test.ts (including the count of
  controls each zone can take); jsdom: zones-inpage.dom.test.ts
  and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-zones.test.ts (with `NARROW_E2E=1`): on a test page in Chromium, the
  boxes, the fixed and sticky controls, the scroll range and the off-page
  skip link are read as laid out, and the result is the same at three scroll
  positions. The panel states have no measured failure under the browser
  checks of this module.
- e2e/narrow-zones.spec.ts: on the built app at 320 by 640 pixels, the grid,
  the check, keyboard use, French, and the barrier text.

Not checked: other browsers, touch with a real hand, and pointers other
than the mouse emulated in Chromium. The zones are what the person marked,
on that screen, that day. Nothing here says what a person can or cannot do.
