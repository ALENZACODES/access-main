# First-letter jump index

On the pack places page, a list of ten or more shown places gets a navigation with one button for
each first letter. Pressing a button moves focus to the heading of the first shown place that starts
with that letter. It only moves focus: it never filters, re-orders or changes the list.

- The letter is read from the name as the pack gives it, with accents and ligatures folded the same
  way the search folds them (É and E are one letter; Ø reads as O).
- A name that starts with a digit, a non-Latin character, or no letter at all files under "#"
  (spoken as "Digits and others"). A place with no name files under the token UNKNOWN, last.
- The index is shown only for ten or more places and at least two different letters.
- The jump finds the list on the page (`ul.record-list`) and the nth item in it, so it needs no
  change to the place cards. If the list is not there it says so.
- Names are never passed through the French typography.

Files: `letterIndex.ts` (grouping), `LetterJump.tsx` (the navigation), mounted in `PackPlaces.tsx`
above the list. No storage, no network, no new keys.
