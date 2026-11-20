# Why a page scrolls sideways

The reflow check says that a page scrolls sideways at 320 CSS pixels. This part of it says where the overflow starts and why, so the finding can be acted on.

## What it adds to the reflow check

For a page that scrolls sideways, one finding per place where the overflow starts, with the numbers that were measured and a way to put it right:

| Rule | What was found | Status |
| --- | --- | --- |
| `cause-fixed-width` | A box wider than the space its parent gives it | fail |
| `cause-min-width` | A `min-width` larger than the space | fail |
| `cause-long-word` | A word with no place to break, quoted and shortened | fail |
| `cause-nowrap` | Text that may not wrap | fail |
| `cause-preformatted` | Preformatted text | fail |
| `cause-media` | An image, video, frame or drawing that does not shrink | fail |
| `cause-flex-nowrap` | Items of a row that cannot wrap (one finding for the row) | fail |
| `cause-grid-columns` | Grid columns of a fixed size that add up to more than the space | fail |
| `cause-positioned` | A positioned box past the edge | fail |
| `cause-offset` | A box that fits and is pushed past the edge by a margin, an offset or a transform | fail |
| `cause-wide-box` | A box that takes the width of what it holds | fail |
| `cause-table` | A table wider than the page | UNKNOWN |
| `cause-not-found` | The page scrolls and no element explains it | UNKNOWN |

And for a region that scrolls sideways on its own (`overflow-x: auto` or `scroll`), on any page:

| Rule | What was found | Status |
| --- | --- | --- |
| `region-text` | Running text in the region is wider than the region | fail |
| `region-content` | Anything else: a table, code, an image, or content that was not recognised | UNKNOWN |

The findings appear wherever reflow findings appear: the command line, the reports, and the audit panel of the app, which looks at the page at its current width.

## How an origin is found

An element is an origin when it reaches past the end edge of the page and also sticks out of its own parent. What is inside it is wide because of it and is not reported again. Text is an origin when it runs past the edge of its own block. What an ancestor clips or scrolls cannot widen the page and is skipped. On a page written right to left, the end edge is the left one.

## What it does not do

- It reads what the browser reports. It does not read the style sheets, so "a width has been set" follows from the numbers (a block is wider than its space) and not from finding the rule.
- It does not decide whether a table, code or a map needs both directions. Those are `UNKNOWN`, for a person.
- It does not look inside frames or shadow trees. A page that scrolls because of one gets `cause-not-found`.
- It changes nothing on the page.
- At most 12 origins and 12 regions are listed. The finding says how many more there are.

## Files

| File | What is in it |
| --- | --- |
| `overflow-inpage.ts` | `overflowInPage`, the function that runs in the page, and the shape of what it finds |
| `overflow.ts` | `causeOf`, `causesOf`, `causeSentence`, `regionSentence`, `auditOverflow`, `withOverflow`, `describeCauses` |
| `overflow-fixtures.ts` | Small pages that each overflow in one known way, for the browser test |
| `overflow-testkit.ts` | Test support: a document made of boxes written by hand |
| `run.ts` | Runs the probe for each route and for the live document |
| `testkit.ts` | The shared stand-in document gained a body with a box, and `querySelector`, `querySelectorAll` and `closest` on elements |
| `index.ts` | Exports these modules, and the colour modules of the earlier rounds |
| `index.ts` | `palette.ts` keeps its `Theme`; the barrel exports the plain-summary `Theme` by name and the palette one as `TokenTheme`, so the two do not clash |

## Not wired, and why

- **A command-line option for colour tokens (`--tokens styles.css`).** Every option needs a key in `config.ts`, and that file is changed by a round that has not merged. A full-file overlay here would undo that change.

## Tests

- `overflow.test.ts`: every cause, its wording in both languages, and the findings.
- `overflow-inpage.test.ts`: the probe on documents whose boxes are written by hand. These run without a browser.
- `overflow-wiring.test.ts`: the probe inside an audit, on the shared stand-in document.
- `e2e-overflow.test.ts` (`NARROW_E2E=1`): 32 fixture pages in Chromium at 320 CSS pixels. Each has to give its cause and its element, and nothing else. This is the test against real layout.

Only Chromium was used. Other browsers may lay out some of these pages differently.
