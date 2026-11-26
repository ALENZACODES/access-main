# Switch scanning

A panel on `/dev/narrow`, after "Dragging and gestures". It is for people who
use one or two switches with scanning: a highlight moves over the controls,
and a press picks the one highlighted. Every control between the start and the
one wanted costs time, and a wrong press can mean starting over.

## Settings

The person sets how they scan, with buttons that say what is chosen by
`aria-pressed`:

- order: one by one, in tab order (linear), or row by row, then along the
  row (row-column);
- moving on: auto scan, where the highlight moves by itself, or step scan,
  one press a step;
- with auto scan, the time a step stays: 0.5, 1, 1.5, 2 or 3 seconds.

The default is one by one, auto scan, 1.5 s. Changing a setting counts again
without reading the page again, and keeps focus on the button pressed.

## Counts

`scanInPage` (scan-inpage.ts) gives the controls the Tab key reaches, in its
order (positive tabindex first, then the page), with their boxes on the
page. A control looks like the main action when it is a submit button, a
button in a form with no type, or named Send, Continue, Save, Search and the
like, in English or French.

`buildScan` (scan-cost.ts) counts, for each control, the highlights up to and
including it from the start of the page:

- linear: its place in tab order;
- row-column: its row, then its place in the row. Rows are built from the
  layout: a control joins a row when its middle is within the row.

With auto scan the time is the steps times the interval, and it takes 1 press
(2 row by row). With step scan there is no time, and it takes a press a step
plus one to select.

It also notes when the main action takes more than 20 steps, when the tab
order goes back up the screen (linear), and rows of more than 8 controls (row
by row), with general hints for the team. With no main action found, its cost
is UNKNOWN.

Once the person changed a setting and the page was read, one line with their
settings and the main action's steps is added to the barrier text of "This
page on your screen".

## What was checked, and what was not

- Unit tests: scan-cost.test.ts, scan-panel.test.ts; jsdom:
  scan-inpage.dom.test.ts and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-scan.test.ts (with `NARROW_E2E=1`): in Chromium at 320 pixels, the tab
  order, the main action and the rows of a laid-out form. The panel states
  have no measured failure under the browser checks of this module.
- e2e/narrow-scan.spec.ts: on the built app at 320 by 640 pixels, by keyboard
  only, and step scan in French.

Not checked: real scanners and switch interfaces, group scanning, scanners
that start from where they stopped, pages that change while scanning, and how
a person scans beyond what they set here.
