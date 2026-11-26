# Shown on hover only

A panel on `/dev/narrow`, after "Things that move". It is for people who
cannot hover: with a touch screen, a switch, a keyboard, voice control, or a
pointer that cannot rest still. A menu, a button or a note shown only while
a mouse pointer rests on something stays out of their reach. WCAG 2.1.1 and
1.4.13 ask for the same content by keyboard focus; touch has neither.

The audit's handlers check (handlers.ts) already reads inline `onmouseover`
handlers and `title` text in the markup. This panel reads the style rules,
where most hover menus live.

## How it works

The person says whether they can hover: "I can hover", "I cannot hover" or
"I am not sure" (the default), with buttons that say what is chosen by
`aria-pressed`. "Find what shows on hover only" reads the page.

`hoverInPage` (hover-inpage.ts) walks every style sheet it can read, opening
`@media` and `@supports`, and keeps the selector parts with `:hover` (not
inside `:not()`) whose rule sets a property that can show something:
display (not none), visibility (visible), opacity (above 0), a height or
width (not 0), clip, clip-path or transform. For each it says:

- whether a rule with `:focus`, `:focus-within` or `:focus-visible` in the
  place of `:hover` exists, after making selectors comparable (spaces,
  combinators, and `:hover` alone written as `*:hover`);
- how many elements the selector reaches without `:hover` are hidden right
  now, and how many of those are or hold a control, with some names.

Style sheets from another origin cannot be read; they are counted, and their
rules are UNKNOWN. It also reads whether the device's main pointer can hover
(`(hover: hover)` or `(hover: none)`). The panel's own sheet and elements are
left out.

`buildHover` (hover.ts) puts rules that hide controls first, then rules that
hide content, then rules with no focus rule that hide nothing right now (which
may only change a look), then rules with a focus rule. It sets that against
the person's answer, with hints for the team. When the person says they can
or cannot hover, one line is added to the barrier text of "This page on your
screen".

## What was checked, and what was not

- Unit tests: hover.test.ts, hover-panel.test.ts; jsdom:
  hover-inpage.dom.test.ts (real style sheets) and the page tests in
  NarrowAuditPage.dom.test.tsx.
- e2e-hover.test.ts (with `NARROW_E2E=1`): in Chromium, a menu shown on hover
  only and a tip with a focus rule; a real hover shows the menu while keyboard
  focus does not; a style sheet from another origin is counted as not read.
  The panel states have no measured failure under the browser checks of this
  module.
- e2e/narrow-hover.spec.ts: on the built app at 320 by 640 pixels, by
  keyboard only, reading the app's own style rules, and in French.

Not checked: content a script shows on hover, rules in sheets from another
origin, whether a focus rule found shows the same content, touch screens,
other browsers.
