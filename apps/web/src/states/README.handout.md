# Large-print page, list codes and per-place pages

Everything is made on the device from the pack already loaded. Nothing is uploaded and no new
storage key is used (a pasted list is added through the existing shortlist).

| File | Role |
| --- | --- |
| `handout.ts` | `buildHandout`: tag, kind, address, map point, source line, pack note and optional questions to ask for each listed place, in the list's order; `parseHandoutOptions` (own properties only); `handoutToText` |
| `handoutHtml.ts` | `handoutToHtml`: one self-contained page, no script and no external file, black on white, sizes in points (14, 18, 24), print rules, answer lines under questions |
| `Handout.tsx` | "Make a large-print page" on the shortlist: size, options, preview, save |
| `listTransfer.ts` | `listToCode` / `parseListCode` / `planImport` / `importSummary`: move a list between devices as plain text |
| `ListTransfer.tsx` | "Move your list to another device" on the places list: copy a code, paste one, see what would be added, then add |
| `PlaceSheet.tsx` | also saves a large-print page for one place |

## Rules kept

- UNKNOWN stays the token UNKNOWN in both languages; the footer says the page is what the pack reports, not a check of the place.
- The pack's OpenStreetMap credit is added exactly (`© OpenStreetMap contributors`) when a listed place comes from it.
- A list code carries ids and names only. Pasted codes are cut at 20,000 characters and 200 lines, checked against the pack, and nothing is added until the button is pressed. Ids the pack lacks, places already listed and places past the limit of 12 are counted and left out.
- Questions are prompts from the existing visit plan; they are off by default and never presented as findings.

## Not covered

- Pages were checked by parsing the HTML in jsdom and by axe-core on the in-app parts; no printer, no real browser print preview and no screen reader were used.
- The 44px target is read from the stylesheet rule, not measured in a browser.
