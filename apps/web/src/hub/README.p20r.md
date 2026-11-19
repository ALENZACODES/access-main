# P20R: Housing language boundaries

The housing package owns the record values and its filters. Two English-only
paragraph templates are still displayed inside a French shell. The host wraps
only the housing module and applies `lang="en"` to paragraphs matching those
complete templates. Other text remains available to the language sweep; the
integration does not translate or infer facts.

The boundary runs in a layout effect before paint and after text/child changes.
It does not schedule tasks, use remote services, manipulate the current route,
or change the document language. Its annotations are withdrawn when text no
longer matches. Upstream language attributes take precedence.

Run `vitest run apps/web/src/hub/HousingLanguageAnnotations.test.ts` for the
contract and the Playwright web E2E runner for EN/FR at 320px and 1280px.
