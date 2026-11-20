# How I press

A panel on `/dev/narrow`, between "Screen zones I can reach" and "Look by
hand". The person presses a large button eight times, the way they usually
do, by touch, mouse, pen, switch set up as a key, or keyboard (Enter or
Space). The panel times each press and says what those times may cause on
many devices and pages.

## What it measures

- How long each press is held, from the down event to the up event, using
  the time stamps the browser gives (the clock of the page when there is
  none).
- The time from each press coming up to the next going down.
- How often a held key repeated.
- How the presses were made: touch, mouse or pointer, key.

A press counts only when it starts on the pad. Only the primary pointer,
the main mouse button, Enter and Space count. A press the browser cancels
(a scroll took it, say) is dropped. There is no time limit, and the test can
be stopped at any point; what was measured is kept.

## What it points to

Against the timing many devices use (`press-timing.ts`):

- a press held 500 ms or more, which many phones take as a long press and
  many keyboards turn into a repeated key;
- a key that repeated while held;
- a press less than 500 ms after the one before, which may be read as a
  double press;
- a press shorter than 30 ms, which some devices ignore.

For each, the panel names the kind of setting that may help, in general
terms (a longer long-press delay, a longer key repeat delay, a setting that
ignores repeated or brief presses), with no product and no promise. With no
press measured, the result is UNKNOWN; with one press, the time between
presses is UNKNOWN.

The panel says the times are those of this screen and this way of pressing,
today, that they say nothing about the person, and that nothing in it is
advice about health. Once the test is over, one line goes into the barrier
text of the fit panel, such as "My presses (key): held from 120 ms to 700 ms;
at least 400 ms between presses."

## What was checked, and what was not

- Unit tests: press-timing.test.ts, press-panel.test.ts (with a stand-in root
  that sends pointer and key events); the page tests in
  NarrowAuditPage.dom.test.tsx send real key events in jsdom.
- e2e-press.test.ts (with `NARROW_E2E=1`): the events Chromium sends for
  mouse and key presses are read as the panel expects, and the hold times
  match the waits between down and up. The panel states have no measured
  failure under the browser checks of this module.
- e2e/narrow-press.spec.ts: on the built app at 320 by 640 pixels, with real
  mouse presses held for set times and real key presses.

Not checked: real touch screens, switches, other browsers, and key repeat
from a real keyboard (Playwright does not repeat a held key).
