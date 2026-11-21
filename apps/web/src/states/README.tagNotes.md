# Tags and notes side by side

A closed section of the pack places page. It lists the places whose wheelchair tag and note can be read in
different directions at first sight, with the note as the pack wrote it and the words that put it on the list
marked. It is a list of places to read, not of mistakes: a note may well explain its tag.

## The three readings (and no others)

| Reading         | Tag                 | The note uses                                          |
| --------------- | ------------------- | ------------------------------------------------------ |
| `yes-steps`     | Yes or Designated   | a steps word                                           |
| `no-ramp-lift`  | No                  | a ramp or lift word                                    |
| `unknown-words` | no tag (UNKNOWN)    | a steps, ramp or lift word                             |

A word right after "no", "not" or "without" (or "sans", "pas"…) does not count, and neither does "step-free".
Tag Limited has no reading. The words come from the note words reader (`noteTopic*`); a place has at most one
reading because each tag belongs to one rule.

## What it does not do

It does not decide what a note means, correct a tag, or rank places. It works on the places shown, so the search
and filters on the page narrow it. The shipped pack has one note, so the list there is empty.

## Files

`tagNoteRules.ts` (the readings), `tagNoteIndex.ts` (list, counts, order), `tagNoteCopy.ts` (EN/FR words),
`tagNoteExport.ts` (text and CSV), `TagNoteReads.tsx`, mounted in `PackPlaces.tsx` after the note words section.
