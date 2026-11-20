# Compare two colours

A tool inside the audit panel on `/dev/narrow`, and an example colour in every contrast failure the audit reports.

## What it does

1. **An example colour in each contrast failure.** When text is below its minimum (4.5:1, or 3:1 for large text), the finding now ends with one sentence such as "For example, text in #767676 gives 4.54:1 on this background." The colour is the closest one, lighter or darker with the hue kept, that reaches the minimum. It appears wherever findings appear: the panel, the reports, the worksheet. A finding that could not be measured stays `UNKNOWN` and gets no example.
2. **Compare two colours.** A person types a text colour and a background colour (hex, `rgb()`, `hsl()` or one of the sixteen basic names) and gets the ratio, whether it reaches the minimums for normal text, large text and parts of controls, and the closest colours that reach the one it misses, each with a button that puts it in the field.
3. **Colour tokens of this page.** A button reads the CSS custom properties of the page and measures the pairs their names put together: `--x-ink`, `--x-text`, `--x-fg` or `--on-x` on `--x`; `--x-fg` on `--x-bg`; a bare `--ink` on `--bg` and `--surface`. Each block that sets tokens (the root, a dark scheme, a theme) is listed, with only the pairs it changes.

## What it does not do

- It states ratios. It does not say that a page conforms to WCAG, and the result says that size, weight and typeface also count.
- It does not guess. A background with transparency gives `UNKNOWN`, because what is behind it depends on the page. A token written with `oklch()`, `color-mix()`, a system colour or an open `var()` gives `UNKNOWN`. A style sheet the page may not read is counted and its tokens are `UNKNOWN`.
- It does not know which tokens a design means to put together beyond their names. `auditPalette` takes extra pairs for that.
- Suggestions change lightness only. They are examples, and the choice stays with the designer.
- It sends nothing and keeps nothing.

## Files

| File | What is in it |
| --- | --- |
| `colorspace.ts` | sRGB to and from OKLCH, `toHex`, `colorDistance`, `readColor` for colours typed by hand |
| `contrast-fix.ts` | `adjust`, `fixContrast`, `fixSentence`, `fixForText`, `auditContrastWithFixes` (used by `run.ts`) |
| `palette.ts` | `themesFromCss`, `pairsByName`, `auditPalette`, `paletteEntries`, `pageCss` |
| `pair-tool.ts` | `comparePair`, `pairStep`, `renderPairTool`, `PAIR_CSS` (drawn by `panel.ts`) |
| `pair-testkit.ts` | Test support: a root with no DOM, a sample style sheet |

`panel.ts` holds the state of the tool, reads the fields before every re-render so nothing typed is lost, and makes the result again when the language changes.

## Not wired, and why

- **The command line.** `paletteEntries` gives the token pairs as findings of the contrast check, ready for a `--tokens styles.css` option. `cli.ts` is part of an open pull request, so this round does not touch it.
- **The barrel.** `index.ts` is changed by the same open pull request. Adding the exports here would undo that change when both land. The four modules are imported directly by `run.ts` and `panel.ts`.

## Tests

- Unit tests for each file. The suggestions are checked by measuring the colour that is written down, over a set of pairs and three minimums.
- `panel-pair.test.ts` and `panel-pair.dom.test.ts`: the tool inside the panel, with a root with no DOM and with a DOM.
- `e2e-pair.test.ts` (`NARROW_E2E=1`): every state of the markup under the browser checks, in the profiles.
- `apps/web/e2e/narrow-pair.spec.ts`: the built app at 320 CSS pixels, including the tokens of the App itself.

None of these show how a screen reader reads the tool. That needs a person.
