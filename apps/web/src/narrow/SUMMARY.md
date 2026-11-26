# My access summary

A panel on `/dev/narrow`, after the other panels. On request, it brings
together what the person measured or said about themselves, so they can share
it with a site or a service when they ask for a change. There are nine parts:

- What I use ("Where to start", once the person marked a tool);
- Button size for my taps (the tap test);
- Screen zones I can reach (the zones grid);
- How I press (the press test);
- My typing pace ("My typing pace", once the practice is over);
- Dragging ("Dragging and gestures", once the drag test is over or the
  person said they cannot drag);
- How I scan with switches ("Switch scanning", once the person set how they
  scan);
- My time to aim ("Things that move", once the person chose a time or
  watched with it);
- Hover ("Shown on hover only", once the person said whether they can).

Only lines about the person come here. What a panel found on this page (the
steps to the main action, the controls that moved, the hover rules, the
fields asked twice) stays in that panel and its barrier-text line, since the
summary goes to other sites. "Asked twice" says nothing about the person, so
it has no part.

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
  measured and asks the site for something: a drag test where every try
  made it, or a person who can hover, asks for nothing, so those parts are
  in the summary but not in the request. It asks and does not demand, and it
  says nothing about the person: what to share is theirs to choose;
- buttons to copy the summary, or the request and the summary.

The text dates the measures and says they come from tests taken on that
screen, that day, and say nothing about health. Nothing is stored or sent.

## What was checked, and what was not

- Unit tests: access-summary.test.ts, summary-panel.test.ts, and the tests
  of the person-only lines in scan-cost, scan-panel, moving, moving-panel,
  hover-panel and gestures-panel; the page tests in
  NarrowAuditPage.dom.test.tsx gather real zones, press, scanning, aim,
  hover, drag and typing results in jsdom, check that no page count reaches
  the summary, that a part needing nothing leaves the request, and that the
  go button moves focus.
- e2e-summary.test.ts (with `NARROW_E2E=1`): the panel states have no
  measured failure under the browser checks of this module, and the summary
  stays whole in its text area at 320 pixels.
- e2e/narrow-summary.spec.ts: on the built app at 320 by 640 pixels, with
  real mouse presses and a marked zone, keyboard use and French.

Not checked: other browsers, and how a site or service receives the text.
