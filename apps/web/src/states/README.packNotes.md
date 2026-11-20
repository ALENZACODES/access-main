# Notes in the pack

A closed-by-default reader on the pack page for the free-text note a pack place may carry
(`wheelchair_description` in the pack file). It shows each note exactly as the pack wrote it.
It does not rewrite, rate, translate or add to a note.

- `packNoteText.ts` folds text for matching, finds match ranges, builds highlight segments and a snippet.
- `packNoteIndex.ts` builds the index: notes, length classes, per-tag counts, and notes repeated on several places.
- `packNoteSearch.ts` parses a query (words, "phrases", -exclusions), filters and orders.
- `packNoteCopy.ts` holds the English and French wording.
- `packNoteExport.ts` writes the .txt and .csv files (CSV formula guard, French spacing, OSM credit).
- `PackNoteBrowser.tsx` is the component, wired into `PackPlaces.tsx` after the outing planner.

Not checked: an end-to-end browser run, and a real screen reader. The shipped pack has few notes, so search and
length behaviour is tested mostly on generated data.
