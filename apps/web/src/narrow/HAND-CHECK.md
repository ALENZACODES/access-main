# Look by hand

A panel on the `/dev/narrow` page, under the other two, that takes a person through the by-hand steps one at a time and gives them a log of what they found.

## What it does

1. **Before you start.** Who is looking (a handle or initials), and what they have besides a browser: a keyboard, a screen reader, a phone or tablet, pages with audio or video. Only steps that fit are shown. An earlier log can be pasted in, so the last look shows next to each step and its notes stay in the new log.
2. **One step at a time.** The criterion, what to do, what to look for, what is needed. The person chooses "I saw a problem", "I found no problem" or "I am not sure", and adds a note. A problem needs a note that says what was seen.
3. **All steps.** A list that can be opened, with where each step stands and a button to go to it.
4. **The log.** The same file `--manual-log` reads, to copy or to save, and the same in words for a message or a ticket.

So what a person records on a phone goes into the reports and the worksheet with no retyping.

## What it does not do

- It stores nothing and sends nothing. Leaving or reloading the page loses the answers, and the panel says so. The log is the way to keep them.
- It does not rate a page. It counts looks. Each step is a first look, and going through all of them does not make a page conform. The panel and the summary both say so.
- It asks nothing about the person but a name for the log. A name that looks like an email address or a phone number is turned away.
- A prepared log is taken off the screen as soon as an answer changes, so an old one is never copied.

## Files

| File | What is in it |
| --- | --- |
| `hand-session.ts` | The session: steps for what the person has, answers, progress, the earlier log, `exportLog`, `exportText`, `summaryText` |
| `hand-panel.ts` | `renderHandPanel`, `handStep`, `mountHandPanel`, `HAND_CSS`, `handPanel` |
| `pages/NarrowAuditPage.tsx` | Mounts the panel, in the language of the audit panel, and keeps the session when the language changes |

It builds on what was there: the steps of `manual-steps.ts`, `manualScript` of `coverage.ts`, and the log format and wording of `manual-log.ts`.

## Not wired, and why

- **The barrel.** `index.ts` is changed by a round that has not merged, and a full-file overlay here would undo that change. The page imports the panel directly.

## Tests

- `hand-session.test.ts`, `hand-panel.test.ts`: the session, every action, the markup of every state under the static checks of this module, wording in both languages.
- `pages/NarrowAuditPage.dom.test.tsx`: the panel on the page with a DOM under it.
- `e2e-hand.test.ts` (`NARROW_E2E=1`): the states of the markup under the browser checks, in the profiles.
- `apps/web/e2e/narrow-hand.spec.ts`: the built app at 320 CSS pixels, from the first step to a saved file, with the keyboard, in English and French.

None of these show how a screen reader reads the panel. That needs a person.
