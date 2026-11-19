# What the checks cover, and what is left to people

`wcag22.ts`, `coverage.ts` and `manual-steps.ts` answer one question: of the
55 Level A and AA success criteria of WCAG 2.2, which do the checks of this
tool look at, and which do they not touch?

| Module | What it holds |
| --- | --- |
| `wcag22.ts` | The 31 Level A and 24 Level AA criteria: number, level, name in English and French, and the version that added each. |
| `coverage.ts` | Which checks relate to each criterion, what one report says per criterion, and a by-hand script. |
| `manual-steps.ts` | One by-hand step per criterion: what to do, what to look for, what is needed. |

## How to read the numbers

- **A related check looks at part of a criterion, never at the whole.** "14 of
  31 criteria have at least one automated check" does not mean 14 criteria are
  tested.
- **"Nothing found" is not a result for the criterion.** It means the checks
  that ran reported nothing on the pages audited.
- **Findings are counted under a check's main criterion only.** Some checks
  also look at another criterion (the keyboard check also looks for keyboard
  traps, 2.1.2). Their findings are not sorted by criterion, so that second
  criterion shows "a related check ran, read its findings".
- **A by-hand step is a first look.** It finds common problems. Going through
  all 55 steps does not make a page conform, and a ticked box records that
  someone looked.
- In French output the status token is UNKNOWN, as in English.

## Use

```ts
import { describeCoverage, describeReportCoverage, renderManualScript } from './coverage.js';

console.log(describeCoverage('en'));
console.log(describeReportCoverage(report, 'fr'));
const script = renderManualScript({ onlyByHand: true }, 'en'); // Markdown checklist
```

`renderManualScript` takes `onlyByHand`, `level` (`A` or `AA`), `needs`
(`browser`, `keyboard`, `screen-reader`, `touch-device`, `media`) and `since`
(`2.1` or `2.2`).

These modules are not yet options of the command line. `cli.ts` is being
changed by another chunk of this lane that has not merged, so adding options
here would collide with it.

## Sources

| Source | Date | Licence | Used for |
| --- | --- | --- | --- |
| Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation (https://www.w3.org/TR/WCAG22/) | 2023-10-05 | W3C Document License | Numbers, English names and levels of the criteria, and the thresholds the steps quote |

The French names and every by-hand step are this tool's own wording. No text
of the Recommendation is copied. The extra relations between checks and
criteria come from the README table of this module and from the header
comments of the checks' own source files.
