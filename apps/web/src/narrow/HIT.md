# Covered controls

A panel on `/dev/narrow`, after "Asked twice". A cookie banner, a bar stuck
to the screen, a chat button or a layer that shows nothing may sit on top of
a control. A finger, a stylus, a head pointer or eye gaze then lands on that,
not on the control, and the press does nothing, or something else.

The audit's focus probe (`focusProbeInPage`) already finds keyboard focus
hidden under fixed or sticky boxes (WCAG 2.4.11), by moving focus. This panel
asks where a pointer lands, for anything on top, without moving focus.

## How it works

"Find covered controls" reads the page. `hitInPage` (hit-inpage.ts) takes
each control (not hidden, disabled or of no size) and asks the browser, with
`elementFromPoint`, what is at five points of it: the middle and four points
near the corners. A point reaches the control when what is there is the
control, something inside it, or one of its labels. For the first point that
does not, it keeps what is on top: its tag, id and first class, its name or
text, whether it is fixed or sticky to the screen, and whether it shows
nothing (transparent, or no text, border, background or picture).

The browser can only answer for what is on the screen. A control that is not
is scrolled up to the middle of the screen first, as far as the page allows,
and the page is put back where the person had it at the end, as the audit's
focus probe does. So the last control of a page that leaves no room under a
bar stuck to its bottom is found covered: it can never be scrolled clear. A
control that still does not fit (taller than the screen) is counted, not
tested, and stays UNKNOWN. It does not move focus or press anything, and
leaves the panel out.

`buildHit` (hit.ts) lists the controls no point reaches (fully covered),
then those some points miss (a press near the edge may land elsewhere), and
counts covers that show nothing and covers stuck to the screen, with hints
for the team. When a control on the screen is covered, one line is added to
the barrier text of "This page on your screen". "Where to start" lists it for
pointer tools.

## What was checked, and what was not

- Unit tests: hit.test.ts, hit-panel.test.ts; jsdom: hit-inpage.dom.test.ts
  (with a stand-in for `elementFromPoint`, which jsdom lacks) and the page
  tests in NarrowAuditPage.dom.test.tsx.
- e2e-hit.test.ts (with `NARROW_E2E=1`): in Chromium at 320 by 640 pixels, a
  button under a cookie bar fixed to the screen, a button half under a layer
  that shows nothing, a button with a span inside and a check box reached by
  its label; a control below the screen scrolled to and found clear, the last
  control of the page found under the bar, and the scroll put back; a real
  click at the middle of the covered button lands on the bar. The panel states have no measured
  failure under the browser checks of this module.
- e2e/narrow-hit.spec.ts: on the built app at 320 by 640 pixels, by keyboard
  only, testing every control of the page and finding none covered, with the
  scroll put back, and in French.

Not checked: covers that come later or only on a hover or a press, controls
taller than the screen, touch screens, other browsers, and whether a covered
control still works by keyboard.
