# Asked twice

A panel on `/dev/narrow`, after "Shown on hover only". Typing the same answer
again costs a lot for someone who types slowly: with a mouth stick, a switch,
eye gaze, dictation or one finger. WCAG 3.3.7 (Redundant Entry) asks that
what was already given is filled in or can be picked, unless entering it
again is needed for security or the answer is no longer valid. Until now the
App listed 3.3.7 only as a manual step.

## How it works

"Find what is asked twice" reads the page. `twiceInPage` (twice-inpage.ts)
gives each field a person can fill in (not hidden, disabled, of no size, or a
check box, radio, file or button) with its label, input type, autocomplete
token (`off` and `on` count as none), form and fieldset legend; and the check
boxes and buttons that may reuse an answer ("Same as shipping address",
"Même adresse", "Use my previous address" and the like). The panel itself is
left out.

`buildTwice` (twice.ts) finds, each field in one finding only:

- a field that asks for an earlier one again: its label says confirm,
  re-enter, again, repeat or retype (confirmer, ressaisir, répéter, retaper,
  de nouveau, à nouveau), and it has the same token, the same email, phone,
  password or number type, or a label that holds the first one's;
- the same autocomplete token twice in a form;
- a shipping and a billing address with no box to reuse one;
- the same label and type twice in a form, in the same group, unless their
  tokens differ (two travellers' names in two groups are left alone). This
  may be two different things, and is said so.

A password asked again is said apart: 3.3.7 allows it for security, so it is
not counted. Only this page is read: something asked on an earlier step is
UNKNOWN. When the page asks for something twice, one line is added to the
barrier text of "This page on your screen".

## What was checked, and what was not

- Unit tests: twice.test.ts, twice-panel.test.ts; jsdom:
  twice-inpage.dom.test.ts and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-twice.test.ts (with `NARROW_E2E=1`): in Chromium at 320 pixels, a
  laid-out checkout form with an email to confirm, a phone asked twice by its
  token, two addresses, two travellers and a password asked twice. The panel
  states have no measured failure under the browser checks of this module.
- e2e/narrow-twice.spec.ts: on the built app at 320 by 640 pixels, by
  keyboard only, and in French.

Not checked: forms over several steps or pages, forms a script builds later,
whether two fields matched really ask for the same thing, and whether a
browser's autofill fills them in.
