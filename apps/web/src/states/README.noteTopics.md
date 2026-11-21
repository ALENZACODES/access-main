# Words in the notes

A closed-by-default reader on the pack page that groups the pack's place notes (`wheelchair_description`)
by the topic words they use: steps, ramps, lifts, doors, washrooms, parking, floors, width, ground, seating, help.

It shows that a note USES a word. It does not say whether a feature is there, in use or in good order,
and a note that says "no steps" still counts under steps. Where a word comes right after "no", "not",
"without", "sans" or "pas" in the same clause, the page says so, and a filter can skip those notes.

- `noteTopicLexicon.ts` the topics and their folded English and French cues (each cue belongs to one topic).
- `noteTopicScan.ts` finds topic words in a note, with positions; marks segments that join back to the note.
- `noteTopicIndex.ts` counts places, uses, places by wheelchair tag, and topics used together.
- `noteTopicFilter.ts` filter by words (any/all) and tag, three orders.
- `noteTopicCopy.ts` English and French wording; `noteTopicExport.ts` .txt and two .csv files.
- `NoteTopics.tsx` the component, wired into `PackPlaces.tsx` after the outing planner.

Not checked: an end-to-end browser run, a real screen reader. The shipped pack has few notes (one at the time
of writing), so the word lists are tested on generated notes; whether they suit real notes is not known yet.
