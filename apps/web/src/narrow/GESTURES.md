# Dragging and gestures

A panel on `/dev/narrow`, after "My typing pace". It is for people who
cannot drag, swipe or pinch, or for whom it costs a lot: many people with a
spinal cord injury, tremor or weak grip, and people who point with their
head, their eyes or a mouth stick. WCAG 2.5.7 (Dragging Movements) and 2.5.1
(Pointer Gestures) ask for a way to do the same with a single tap or click.

## The drag test

The person presses a square handle and drags it to the dashed end of a
track, the way they usually point, up to 3 times, with no time limit. A try
ends when the handle reaches the last tenth of the track, or when it is let
go (or the browser cancels the pointer). For each try the panel keeps whether
it reached the end, how long it took, how far it got and the kind of pointer.

The track is hidden from assistive technology and the handle takes no focus:
the test is for the pointer only. "I cannot drag" records that dragging is
not possible here, with no try, and works by keyboard. "Stop the test" keeps
the tries done. The panel is not drawn again while the handle moves.

The result says how many tries made it, the middle time of those that did,
and how far the best short try got. With no test, it is UNKNOWN. When not
every try made it, or the person said they cannot drag, one line is added to
the barrier text of "This page on your screen", asking for a single-tap way.

## The page

`gestureInPage` (gesture-inpage.ts) finds:

- sliders (`input type=range`, `role=slider`);
- items to drag (`draggable=true`, `aria-grabbed`), not the parts inside one;
- carousels (`aria-roledescription` carousel or carrousel);
- canvases and `role=application` of 100 by 100 pixels or more;
- areas of 44 by 44 pixels or more with `touch-action: none`;
- strips that scroll sideways and snap (`overflow-x` auto or scroll,
  `scroll-snap-type` on x, wider content).

For each, it looks for a button that may do the same, by its name (plus and
minus, Move up, Next, Zoom in and the like, in English and French), a number
field next to a slider, or tabs in a carousel. It looks two levels around the
control, never across the whole page or its main part; for an area that takes
touch for itself, it looks inside it only. It says whether the control can be
reached by keyboard, and that keyboard alone does not count as a single-tap
way. It leaves the panel out and moves nothing.

Controls with no way found come first. A way found is a button whose name
suggests it: whether it really does the same stays to be tried, and the
panel says so. With the drag test, it says the controls with no way found may
block the person; without it, what this means for them is UNKNOWN.

## What was checked, and what was not

- Unit tests: drag-trial.test.ts, gestures.test.ts, gestures-panel.test.ts;
  jsdom: gesture-inpage.dom.test.ts and the page tests in
  NarrowAuditPage.dom.test.tsx.
- e2e-gestures.test.ts (with `NARROW_E2E=1`): in Chromium, the slider with
  its buttons, the areas with `touch-action: none` and the snapping strip,
  which jsdom cannot read. The panel states have no measured failure under the
  browser checks of this module.
- e2e/narrow-gestures.spec.ts: on the built app at 320 by 640 pixels, three
  drags with Playwright's mouse, "I cannot drag" and the reading by keyboard,
  in French.

Not checked: real fingers, head pointers, eye gaze or mouth sticks, touch
screens, other browsers, gestures a page listens for with no sign in its
markup or styles, and whether a way found really does the same.
