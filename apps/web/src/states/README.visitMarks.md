# Visit marks

Lets a person mark each listed place as **To visit**, **Been there** or **Ruled out**, or leave it
with no mark. A mark is the person's own note. It says nothing about the place and never changes what
the pack says about it. Nothing is ranked, scored or reordered by a mark.

## Files (apps/web/src/states)

| File | What it does |
| --- | --- |
| `visitMarks.ts` | Marks as `{id, status, markedOn}`; checked reading of stored text (own keys, valid id and status, repeats once, cut at 200); set, clear, keep-only, summary, load and save. |
| `useVisitMarks.ts` | Hook over a store: keeps two changes made in one turn, says when marks cannot be kept, picks up changes from another tab. |
| `visitMarksCopy.ts` | English and French words. No word about a place being good, safe or accessible. |
| `visitMarksExport.ts` | Text (grouped by status in a fixed order, places in list order) and CSV (UNKNOWN for missing, formula guard). |
| `VisitMarks.tsx` | Closed by default, no heading. One radio group per listed place, a note for marks on places no longer listed, text and CSV save. |
| `marksTransfer.ts` | A marks code (`MARKS v1`, one `- id | status | name` line per mark) and a plan for a pasted one: set, replace, same, not in the pack, over the limit, not understood. |
| `MarksTransfer.tsx` | Copy a code, or paste one, see the plan and press a button to set. Closed by default. |
| `PackPlaces.tsx` | Mounts it after the list. |

## Rules kept

- Stored under its own key `app.visit-marks.v1`; the list's own key is untouched.
- Only id, status and the day are stored, never a name, address or note.
- A mark whose place leaves the list stays until the person removes it; the tool says how many there are.
- If the browser will not store marks the tool still works until the page is closed and says so.

## Tests

`visitMarks`, `visitMarksCopy`, `visitMarksExport`, `useVisitMarks` unit tests; `VisitMarks.dom.test.tsx` (axe, both
languages, saving, other tab); `visitMarks.keyboard.dom.test.tsx`; `PackPlaces.visitMarks.dom.test.tsx` (wiring);
`marksTransfer` and `MarksTransfer.dom` tests; `visitMarks.source.test.ts`; `visitMarks.fuzz.test.ts` (seeded).
