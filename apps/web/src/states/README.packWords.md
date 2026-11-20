# Words in this pack

Help with the words typed in the pack search, and a list of the words the pack uses.

## What it does

- **Words no place has.** When a plain word in the search (or one after `name:`, `address:`, `kind:` or `note:`)
  matches no place, the page says so and lists up to three words the pack does have that are near it:
  - a word within one or two letters (none for words of three letters or fewer), counted as in the place
    suggestions; and
  - for a few French words (pharmacie, stationnement, poste, bijouterie, billets, …), the kind the pack names in
    English, only if the pack has a place of that kind.
  Each shows how many places have it, counted with the search itself, and a button puts the changed search in the
  box. The rest of what was typed is kept exactly as typed.
- **Words in this pack.** A closed section listing the words of the pack (names, addresses, kinds, notes, or the
  first three together) with the number of places that have each, the most places first. Pressing a word searches
  for it. The list can be saved as text or as a CSV (`word,field,places`).

## What it does not do

It never says what a person meant, and never calls a word right or wrong. Words after `-`, phrases, `tag:`, `has:`
and `no:` are not checked: a word asked to be left out matching nothing is not a problem. Words are shown without
accents or capitals, as the search reads them. The shipped pack is small, so the list is short.

## Files

`packWordIndex.ts` (counting), `packWordNear.ts` (close words), `packWordMisses.ts` (finding the words and swapping
one), `packWordCopy.ts` (EN/FR words), `packWordExport.ts` (text and CSV), `PackWords.tsx` (two components),
mounted in `PackPlaces.tsx` under the other search help. Typed and pack words are put in from outside `t()`.

## Also in this round

`packSearchParse.ts` now looks up field, tag and has words by own keys only. Before, `tag:constructor` and
`constructor:x` were read as if they were valid; they are now an unreadable value and an unknown field.
