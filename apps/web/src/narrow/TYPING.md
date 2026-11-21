# My typing pace

A panel on `/dev/narrow`, after "Pointer travel". It is for people who type
with a keyboard held some other way, an on-screen keyboard, a mouth stick,
switch scanning or dictation, for whom a form that times out is a barrier.

The person types three short things the way they usually do: a name, a postal
code and an email address. There is no time limit in the practice, and what
they type stays in the panel; nothing is stored or sent. The fields are not
drawn again while they type, so focus and the caret stay put. For each field
the panel keeps:

- the time from the first change to the last (a field with one change only
  has no time, and is not counted);
- the characters in it at the end;
- the changes that took characters back (input types starting with `delete`,
  and `historyUndo`).

From the fields used it gives characters a minute and the middle time per
field. With nothing measured, the pace is UNKNOWN.

It then reads the page: the text fields a person can see and type in (the
panel's own are left out), and a time limit the page states, found as a
number of minutes in a sentence about a session, a time-out or inactivity, in
English or French. The time for the page is the middle time per field times
the number of fields, said as an estimate from the practice, not a measure of
the page. With no limit found, the limit stays UNKNOWN, since one may apply
without being written. When the estimate is over the stated limit, the panel
quotes the sentence and says accessibility rules ask for a way to extend or
turn off a time limit; when it is over half the limit, it says that leaves
little room for a break.

Once the practice is over, one line with the pace is added to the barrier
text of "This page on your screen". The times come from three short tries on
one screen, and say nothing about the person.

`typingRawInPage` (typing-inpage.ts) counts the visible, enabled text fields
(text, email, tel, number, search, url and password inputs, textareas and
editable regions) and gives the text of the page in sentences, without
scripts, styles, templates or the panel. It reads only.

## What was checked, and what was not

- Unit tests: typing-trial.test.ts, typing-panel.test.ts; jsdom:
  typing-inpage.dom.test.ts and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-typing.test.ts (with `NARROW_E2E=1`): in Chromium, the field count and
  the limit on a laid-out page, and the input types real typing and
  Backspace raise. The panel states have no measured failure under the
  browser checks of this module.
- e2e/narrow-typing.spec.ts: on the built app at 320 by 640 pixels, a
  practice by keyboard, stopping at once, and French.

Not checked: real on-screen keyboards, switch scanning, dictation, mouth
sticks, other browsers, limits that a page states only in a dialog or after a
delay, and limits that are never written down.
