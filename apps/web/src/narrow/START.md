# Where to start

A panel on `/dev/narrow`, right after the audit tool. The page has many
tests; a person who points with a head pointer needs different ones first
than a person who uses switches or their voice.

The person marks what they use to point and type, as many as apply: a finger
on a touch screen, a stylus, a mouth stick, a head pointer, eye gaze, one or
two switches, their voice, a keyboard only, or a mouse, trackball or
touchpad. The buttons say what is marked by `aria-pressed`, and focus stays
on the one pressed. Only tools are asked for, never a condition or a reason,
and nothing is stored or sent.

## How the tests are put in order

`start.ts` gives, for each tool, the tests that matter for it, most first
(`TOOL_TESTS`). With several tools, a test gets more weight the earlier it
comes for each tool, the weights add up, and ties keep the order of the page
(`startOrder`). The first six are listed with what each shows and the tools
it is useful with; the other tests follow in page order. Every test has a
button that takes focus to the heading it starts with; each button names its
test with no word for a button, so no two share a name.

What the person marked becomes the first part of "My access summary": "What I
use: …", tools only.

## What was checked, and what was not

- Unit tests: start.test.ts (every tool points to tests that exist, the order
  and its ties, the words in both languages, no health words),
  start-panel.test.ts; the page tests in NarrowAuditPage.dom.test.tsx check
  that every test listed has its heading on the page, that a go button moves
  focus, and that the summary gets the line.
- e2e-start.test.ts (with `NARROW_E2E=1`): the panel states have no measured
  failure under the browser checks of this module.
- e2e/narrow-start.spec.ts: on the built app at 320 by 640 pixels, by
  keyboard only, and in French.

Not checked: whether the order fits any one person; it is a starting point,
and every test stays on the page.
