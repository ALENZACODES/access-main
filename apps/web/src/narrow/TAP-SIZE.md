# Button size for my taps

A panel on the `/dev/narrow` page, between "This page on your screen" and "Look by hand". It is a short test that finds the button size at which a person's taps land on their screen, and says what that means for the App and for the page they are on.

## What it does

1. **The test.** Targets appear one at a time inside an area of the page: 4 at 96, 72, 56 and 44 CSS pixels, from large to small, at fixed places that reach the corners and the middle. A tap on the target lands. A tap on the area beside it is a miss. The test can be stopped at any time.
2. **The result.** The smallest size at which every tap landed, with every tap landing at each larger size too. A miss at one size stops the result there, whatever happens at smaller sizes. A table gives the taps at each size.
3. **What it means for the App.** The controls of the App are at least 44 CSS pixels. The panel names the first browser zoom that brings them to the size found, and how wide the page would then be. When that is less than the 320 CSS pixels the App is checked down to, it says that some content may scroll sideways, and how to report it.
4. **The controls of this page** that are smaller than the size, by name and size, measured when the test ends.
5. **Into the barrier report.** Once the test is over, the text that "This page on your screen" prepares has one more line with the settings: the size found, or `UNKNOWN`. It follows the box for the settings, so a person who leaves their settings out leaves this out too.
6. **Copy the result**, to paste into a message.

## What it does not do

- It says nothing about the person. It measures taps, on this screen, today, and every sentence says so. It gives no health or eligibility advice.
- It does not guess. Too few taps gives `UNKNOWN`. Misses at the largest size give `UNKNOWN`, with no zoom named, because the size that works is above what the test measures. A size with no tap reads `UNKNOWN` in the table. A page width the browser does not report is `UNKNOWN`.
- It never shows a target below 44 CSS pixels, and every target stays inside its area, so the test never widens the page.
- With a keyboard or a switch every press lands, and the panel says the test is for touch and pointers.
- It stores nothing and sends nothing.

## Files

| File | What is in it |
| --- | --- |
| `tap-trial.ts` | The plan of the test, recording taps, `tapResult`, `zoomFor`, `zoomAdvice`, `controlsBelow`, and the sentences |
| `tap-panel.ts` | `renderTapPanel`, `tapStep`, `mountTapPanel`, `tapResultText`, `TAP_CSS`, `tapPanel` |
| `barrier-report.ts`, `fit-panel.ts` | `extra` lines in the barrier text, and `extraFacts`, asked for when the text is prepared |
| `pages/NarrowAuditPage.tsx` | Mounts the panel in the language of the audit panel, keeps a finished result when the language changes, and hands the tap line to the fit panel |

## The fix for #231 in this round

The input audit of another lane (`e2e/a11y-input/route-input.spec.ts`) found 34 unnamed buttons on `/dev/narrow`. They were the step buttons of "Look by hand", inside a closed `<details>`: Chromium gives them a box and no accessible name. The list is now added by a button with `aria-expanded`, and its step buttons exist only while it is shown. `hand-panel.ts`, its tests, the page DOM test and `narrow-hand.spec.ts` changed with it.

## Not wired, and why

- **The barrel.** `index.ts` is part of #231, which is still open. Exporting from it here would need the same file in two places.

## Tests

- `tap-report.test.ts`: the tap line in the barrier text, and how the fit panel asks for it.
- `tap-trial.test.ts`, `tap-panel.test.ts`: the plan, every result, the zoom steps, the wording in both languages, the markup of every state under the static checks of this module.
- `pages/NarrowAuditPage.dom.test.tsx`: the panel on the page with a DOM under it.
- `e2e-tap.test.ts` (`NARROW_E2E=1`): every state and every target of the plan under the browser checks, in the profiles.
- `apps/web/e2e/narrow-tap.spec.ts`: the built app at 320 CSS pixels with real clicks on and beside the targets, and a touch screen with real taps.

None of these show how a screen reader reads the panel. That needs a person.
