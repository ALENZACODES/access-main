# Say it to press it

A panel on `/dev/narrow`, after "How I press", for people who use voice
control. Voice control tools press a control when a person says its name,
such as "click Send". They match the words said against the name the
control gives to assistive technology. That works in one step only when:

- the control shows words a person can read and say;
- its name holds those words, in the same order (WCAG 2.5.3, Label in Name);
- no other control on the page has the same name.

Otherwise the person has to guess the hidden name, or ask the tool to show
numbers or a grid and say a number: more steps, and more speaking, each
time.

## What it does

`voiceInPage` (voice-inpage.ts) reads each visible control of the page: its
role (button, link, field, choice), the name it gives to assistive
technology (aria-labelledby, aria-label, the value of an input button, the
label of a field, the text, then title or placeholder), and the words it
shows (text a person sees, leaving out images, icons and text clipped down
for screen readers only). It leaves out hidden, disabled, inert and
aria-hidden controls, and the panel itself, and moves nothing.

`voice.ts` then counts, for each control: no name, no words shown, a name
that does not hold the words shown, and a name shared with another control.
The rest can be reached in one step by saying what they show.

A field lets the person type what they would say. Command words in front
("click", "tap", "cliquer sur", "appuyer sur"…) are left out, and the panel
says whether the phrase reaches no control, one control, or several (then
the tool will ask which one). The answer is also said in the live region.

The panel names no voice product, and says that tools differ: some match
parts of names, or show numbers on their own.

## What was checked, and what was not

- Unit tests: voice.test.ts, voice-panel.test.ts; jsdom: voice-inpage.dom.test.ts
  and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-voice.test.ts (with `NARROW_E2E=1`): on a test page in Chromium, every
  name worked out is found by Playwright under the same role and exact name,
  that is, it is the accessible name Chromium gives the control. Icon
  buttons, screen-reader-only text and shared names are found. The panel
  states have no measured failure under the browser checks of this module.
- e2e/narrow-voice.spec.ts: on the built app at 320 by 640 pixels, the read,
  a phrase that reaches the button of another panel, keyboard use and
  French.

Not checked: any real voice control tool, speech recognition, other
browsers, and names from CSS generated content.
