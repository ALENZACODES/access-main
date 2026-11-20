# Pack search: words, phrases and fields

The pack page search keeps working with plain words (every word must be in the name, address or kind).
It now also reads:

| Typed | Means |
| --- | --- |
| `"main street"` | the words in that order |
| `-bar` | leave out places that match |
| `cafe OR bar` (`OU`) | either one; capitals only |
| `kind:cafe` `name:` `address:` `street:` `note:` | one detail only (`genre`, `nom`, `adresse`, `rue` in French) |
| `tag:yes` | a wheelchair tag value (`indication:oui`) |
| `has:note` `no:address` | the place has / has not that detail (`avec:` `sans:`) |

An unknown field word is searched as plain text, and a value that cannot be read is left out; both are listed
under the search box ("How your search is read"). Nothing is guessed. The search tips (closed by default) have
examples that put a search in the box and say how many places in the pack each finds.

- `packSearchParse.ts` text → clauses of terms, plus problems. `packSearchMatch.ts` a place against a parsed search.
- `packSearchExplain.ts` and `packSearchHelp.ts` wording (EN/FR). `PackSearchHelp.tsx` the echo line and the tips.
- `packPlacesView.ts` now filters by this parser; a search of plain words gives the same places as before
  (a generated-data test compares it with the old rule). A leading `-` and `"` now have meaning in the box.

Not checked: end-to-end browser run, a real screen reader. Tested on 24 shipped places and generated places.
