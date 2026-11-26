# Places that share a name

Shown on the places list, closed to begin with, when two or more places are on screen. It puts places with the same name side by side, for example several branches of one shop, so their addresses and tags can be read together.

- **Matching** is by the name alone. Case, accents, punctuation and spacing are ignored, and so are a "#12" branch number and a bracketed note. A number that is part of the name ("Studio 54") is kept, so "Station 2" and "Station 3" are different names. A name that is missing, `UNKNOWN`, a single letter, longer than 120 characters or only punctuation cannot be matched and is counted as unusable.
- **Not a claim.** Two places with one name may be unrelated. Nothing here says they are one business, and nothing ranks one above another.
- **Listing.** Names carried by one place are not listed; the summary counts them. Names are ordered by number of places (default), by name, or by their closest place to the point typed in the near-me fields. Choices: smallest group (2, 3 or 5), all names or only those whose wheelchair tags differ, and 5, 10 or 25 names shown.
- **Tags** are shown as counts in a fixed order. "The tags differ" is a plain fact about the group, not a verdict.
- **Distance.** With a good near-me point typed, each place shows its straight-line distance on screen and the closest comes first within a name. The saved files carry no distance, so where the person is stays on screen.
- **Saved files** (made on this device): text and CSV, for every name the choices leave, not only the ones shown. CSV text that starts like a formula is defused.
- **Names one letter apart.** Below the list, pairs of different names that differ by one letter missing, one letter different or two neighbouring letters swapped (names under five letters are not compared). A pair may be one name spelled two ways or two different places; it is only a pair to look at. Ten pairs show on screen and a CSV holds all of them (up to 200, the rest counted), with the ids behind each name.
- **Not kept.** Choices live in memory and are gone when the page closes; nothing is written to storage or sent.

Files: `sameName.ts` (matching, groups, order), `sameNameCopy.ts` (words, text and CSV), `nearNames.ts` and `nearNamesCopy.ts` (one-letter pairs), `SameName.tsx`; mounted from `PackPlaces.tsx`.
