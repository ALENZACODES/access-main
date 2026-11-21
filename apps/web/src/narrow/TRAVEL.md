# Pointer travel

A panel on `/dev/narrow`, after "Slips onto risky controls". It is for
people who move a pointer with their head, their eyes, a mouth stick or a
trackball, for whom every move costs. For each form of the page it counts:

- how far the pointer travels from the centre of each control to the centre
  of the next, in document order, from the first to the last;
- how far it is from the first control to the button that sends the form
  (UNKNOWN when the form has none);
- how often the path changes direction left and right (moves under 40
  pixels sideways do not count), which fields set side by side cause;
- the longest single move.

Distances are in CSS pixels and in widths of the window as it is now; with
no window width they are in pixels only, and the panel says the width is
UNKNOWN.

It points to more than 2 changes of direction in one form, a single move
wider than the window, and a path to the send button longer than 3 window
widths, each with a general hint (one column, controls in the order they are
filled in, a shorter form or one in steps). It says the distances measure the
layout, not anyone's effort.

`travelInPage` (travel-inpage.ts) reads each visible control with its kind,
its form (by the `form` property, so a button tied to a form by its `form`
attribute counts) and its box on the page, and each form's name
(aria-label, aria-labelledby or legend). It leaves the panel out and moves
nothing.

## What was checked, and what was not

- Unit tests: travel.test.ts, travel-panel.test.ts; jsdom:
  travel-inpage.dom.test.ts and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-travel.test.ts (with `NARROW_E2E=1`): in Chromium, the same six fields
  laid out in two columns give a longer path with more than two changes of
  direction, and in one column none. The panel states have no measured
  failure under the browser checks of this module.
- e2e/narrow-travel.spec.ts: on the built app at 320 by 640 pixels, the
  count, keyboard use and French.

Not checked: real head pointers, eye gaze or mouth sticks, other browsers,
and the order a person really fills a form in.
