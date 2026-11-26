# Things that move

A panel on `/dev/narrow`, after "Switch scanning". It is for people who aim
slowly: with a head pointer, eye gaze, dwell clicking, a mouth stick, or a
hand with tremor or little strength. A control that moves, appears or goes
away while they aim can make them miss it, or press something else.

## How it works

The person says how long they take to aim: 2, 5 or 10 seconds (5 by
default), with buttons that say what is chosen by `aria-pressed`. "Watch this
page" takes one look at the page, waits that long, and takes a second look.
"Stop watching now" takes the second look at once. Nothing is pressed.

`movingLookInPage` (moving-inpage.ts) gives, at each look:

- the controls with their boxes on the page. Each is counted among controls
  of the same kind and name, so a control inserted before it (a cookie
  banner, say) does not change its id;
- the running animations, from `document.getAnimations()`, with whether they
  ever stop and whether they are on a control or hold one (null when the
  browser cannot list them);
- buttons whose name suggests they pause motion (Pause, Stop, Arrêter and
  the like);
- whether the device asks for less motion (`prefers-reduced-motion`), or
  null when it cannot be told.

`compareLooks` (moving.ts) says which controls moved 8 pixels or more or
changed size (those whose new box no longer covers the middle of the old
one first: a pointer resting there now misses them), which appeared and which
went away. It notes:

- controls that left their place, appeared or went;
- endless animations on controls;
- something endless with no pause button found (WCAG 2.2.2);
- endless animations while the device asks for less motion;

with general hints for the team. Animations the browser cannot list, and
motion slower than the watch, are UNKNOWN.

After a watch, one line is added to the barrier text of "This page on your
screen": the person's time to aim, and how many controls moved here.

## What was checked, and what was not

- Unit tests: moving.test.ts, moving-panel.test.ts; jsdom:
  moving-inpage.dom.test.ts and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-moving.test.ts (with `NARROW_E2E=1`): in Chromium at 320 pixels, a
  button pushed down by an inserted banner, the banner's button that
  appeared, an endless and a finite CSS animation, a pause button, and the
  reduced motion setting as Chromium emulates it. The panel states have no
  measured failure under the browser checks of this module.
- e2e/narrow-moving.spec.ts: on the built app at 320 by 640 pixels, a 2
  second watch by keyboard that finds the page still, and stopping at once in
  French.

Not checked: real head pointers, eye gaze or dwell clicking, motion that
starts on scroll, hover or after a longer wait, video and canvas drawing,
other browsers, and how long any person really takes to aim.
