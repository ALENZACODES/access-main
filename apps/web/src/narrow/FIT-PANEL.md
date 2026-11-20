# This page on your screen

A panel for the person using the App, on the `/dev/narrow` page under the audit panel.

## What it does

1. **Your screen and settings.** A table of what the browser reports: width and height of the page area, text size against the browser default, orientation, pointer, hover, reduced motion, more contrast, forced colours, colour scheme. A setting the browser does not report reads `UNKNOWN`, in English and in French. It is never guessed.
2. **What the checks find on this page.** Runs the same checks as the audit panel and says what they found in plain words, grouped by the kind of difficulty: seeing and hearing, moving around and pressing, reading and understanding, working with a screen reader or voice control. When the checks find nothing, it says that and no more, and it always says that the checks look at part of what makes a page usable.
3. **Tell us about a barrier.** A kind of barrier (radio buttons), a description, and two boxes: add my settings, add what the checks find. The result is plain text the person can copy or save as a file.

## What it does not do

- It sends nothing. There is no form submission and no request. Copying uses the clipboard of the browser, saving uses a `data:` link.
- It asks for no name, email address or phone number. If the description seems to hold an email address or a phone number, the panel says so next to the finished text and leaves the choice to the person. It does not change the description.
- The page is given by its path only. The part of the address after `?` or `#` is left out, because it can hold what a person searched for.
- It keeps nothing between visits.
- It does not say a page conforms to WCAG, and it gives no advice about a person's situation.

## Files

| File | What is in it |
| --- | --- |
| `device-facts.ts` | `readDeviceFacts(env)`, `browserEnv()`, `describeFacts`, `factsAsText`, `fitNotes`, `widthBand` |
| `plain-summary.ts` | `summarisePlainly(report)`, `plainHeadline`, `plainLimit`, `groupLine`, `plainSummaryText`, `themeOf` |
| `barrier-report.ts` | `validateBarrier`, `personalWarning`, `pagePath`, `renderBarrierText`, `barrierFileName`, `barrierDataUrl` |
| `fit-panel.ts` | `renderFitPanel`, `mountFitPanel`, `FIT_CSS`, `fitPanel` |
| `fit-testkit.ts` | Test support: browsers that answer as told, a root with no DOM |

`mountFitPanel({ root, lang })` is all a page needs. `env`, `run`, `now`, `copy` and `location` can be passed in for tests. `draft` gives the answers to start from, and `getDraft()` on the returned object hands back what is in the form, which is how the page keeps the answers when the language changes.

## Tests

- Unit tests for each file, including the markup of every state under the static checks of this module.
- `pages/NarrowAuditPage.dom.test.tsx`: the panel on the page with a DOM under it.
- `e2e-fit.test.ts` (`NARROW_E2E=1`): every state of the markup under the browser checks, in the profiles.
- `apps/web/e2e/narrow-fit.spec.ts`: the built app at 320 CSS pixels, from an empty form to a saved file, with the keyboard, in English and French.

None of these show how a screen reader reads the panel. That needs a person.
