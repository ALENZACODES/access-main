# Slips onto risky controls

A panel on `/dev/narrow`, before "My access summary". It finds where a tap
aimed at one control of the page may land on another control that does
something hard to take back: delete, remove, cancel, clear, sign out, send,
pay, and their French words (`RISKY_WORDS` in slip.ts, matched as whole
words).

## How it works

A tap aimed at the centre of a control lands somewhere within a circle
around it. The size of that circle is the person's own tap size from the
tap test on this page ("Button size for my taps") when they took it, and the
App's 44 pixel minimum when they did not; the panel says which, and says the
person's own size stays UNKNOWN until the test is done. The size is read
again at each reading, so a tap test taken later counts.

`slipInPage` (slip-inpage.ts) reads each visible control, with its name and
its box on the page, and moves nothing. `slip.ts` then lists, for each
control, the risky controls whose box reaches into the circle of a tap aimed
at its centre, closest first, and the risky controls smaller than the tap
size. When anything is found, it says what may help in general terms: more
space, risky controls away from everyday ones, a confirmation or a way to
undo.

It does not say how often anyone slips, and the list of risky words is
short; the panel says so.

## What was checked, and what was not

- Unit tests: slip.test.ts, slip-panel.test.ts; jsdom: slip-inpage.dom.test.ts
  and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-slip.test.ts (with `NARROW_E2E=1`): in Chromium, the boxes are read as
  laid out at two scroll positions; a pair is found at a 72 pixel tap and
  not at 44; and a real click inside the 72 pixel circle of Save, past its
  edge, lands on Delete. The panel states have no measured failure under
  the browser checks of this module.
- e2e/narrow-slip.spec.ts: on the built app at 320 by 640 pixels, the
  reading, keyboard use and French.

Not checked: real taps by a hand, other browsers, and risky actions named
in words not on the list.
