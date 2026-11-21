# My access summary

A panel on `/dev/narrow`, after the tap, zones and press tests and "Say it
to press it". On request, it brings together what the person measured in
those three tests, so they can share it with a site or a service when they
ask for a change:

- Button size for my taps (the tap test);
- Screen zones I can reach (the zones grid);
- How I press (the press test).

## How it works

`access-summary.ts` turns the line each test gives for the barrier text
into a summary. A test not done yet is `UNKNOWN, not done yet.`, never
guessed. The summary is gathered again each time the person asks, so a test
done after the first summary shows in the next one.

The panel (`summary-panel.ts`) shows:

- how many parts are done;
- each part, with a button that takes focus to the heading of its test when
  it is not done (each button names its test, so no two share a name);
- the text to share, in a read-only text area that can be selected by hand;
- a short request the person may send with it, naming only what was
  measured. It asks and does not demand, and it says nothing about the
  person: what to share is theirs to choose;
- buttons to copy the summary, or the request and the summary.

The text dates the measures and says they come from tests taken on that
screen, that day, and say nothing about health. Nothing is stored or sent.

## What was checked, and what was not

- Unit tests: access-summary.test.ts, summary-panel.test.ts; the page tests
  in NarrowAuditPage.dom.test.tsx gather real zones and press results in
  jsdom, and check the go button moves focus.
- e2e-summary.test.ts (with `NARROW_E2E=1`): the panel states have no
  measured failure under the browser checks of this module, and the summary
  stays whole in its text area at 320 pixels.
- e2e/narrow-summary.spec.ts: on the built app at 320 by 640 pixels, with
  real mouse presses and a marked zone, keyboard use and French.

Not checked: other browsers, and how a site or service receives the text.
