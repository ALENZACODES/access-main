# Housing language annotations

The `/more/housing` integration renders a linked housing tool. Its locale can
be French while two isolated, English-only paragraph families remain in the
rendered page. The wrapper adds `lang="en"` to those English paragraphs without
changing the displayed strings or any source, licence, date, or UNKNOWN value.

`HousingLanguageAnnotations.ts` contains the narrowly scoped detection and DOM
annotation. `HousingLanguageBoundary.tsx` invokes it in a layout effect and
observes later result changes. The implementation does not insert copy, infer
accessibility, or contact external services.

`HousingLanguageAnnotations.test.ts` exercises the supported and rejected
sentences. The Playwright-discovered `housing-english-annotations.spec.ts` tests
French at 320px and 1280px, including a filter-driven rerender. Remaining
English passages should be corrected in the linked package's translations;
the integration boundary is not a substitute for a full content review.
