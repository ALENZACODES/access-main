# P20M: inherited-language and route-matrix regression

The existing Playwright configuration discovers `*.spec.ts` in this directory.
This round changes the existing semantic-integrity sweep instead of adding a
second crawl. The inventory uses `appRoutes()` and requires unique paths and
specific shell routes; the route count is intentionally not pinned.

`semantic-integrity-browser.ts` now collects visible text owned by semantic
blocks that inherit their language from `html` or a parent. Previously it only
collected elements with an explicit `lang` attribute, so unmarked English
copy inside a French document was invisible to the language audit.

`languageIssues()` reports high-confidence English UI phrases inherited under
French, including the heading cases for the housing, diary and auditor tools.
It does not infer a language from arbitrary place names, individual borrowed
words, codes, or numeric data. Deliberately marked English text is retained,
including the name of the English language option.

The semantic live matrix now covers eight required routes, including
`/more/housing`, `/more/diary` and `/more/auditors`. It executes one test per
language/viewport pair with route-level `test.step` diagnostics, rather than
starting a new browser context for every one of twenty route combinations.
Each failure still fails the Playwright job, and the wider route-wide axe
matrix continues to run independently.

Run from the repo's configured web workspace:

```
npx playwright test e2e/axe-sweep/semantic-integrity.spec.ts e2e/axe-sweep/semantic-integrity-browser.spec.ts
npx playwright test e2e/axe-sweep/semantic-integrity-live.spec.ts
```

This is an automated regression check, not proof that every language switch or
assistive-technology experience is correct. Manual review of French text,
first paint, keyboard behaviour and any unclassified text remains necessary.
