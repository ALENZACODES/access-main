import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The French strings in these files go through frTypography at run time, but the source should
 * already be right so a reader and a linter see the same text: a no-break space (U+00A0) before ":",
 * a narrow one (U+202F) before ; ! ? and inside « ». Only the text of a string literal is checked.
 */
const FILES = ["shortlistTable.ts", "shortlist.ts", "packCategories.ts", "packCategoryExport.ts", "Shortlist.tsx", "PackCategories.tsx", "PackPlaces.tsx", "useShortlist.ts", "packDiffText.ts", "packCompareCopy.ts", "PackCompare.tsx", "packDiff.ts", "packEarlier.ts", "packEarlierId.ts", "csvParse.ts", "visitQuestions.ts", "visitPlanText.ts", "visitChecks.ts", "VisitPlan.tsx", "visitFilter.ts", "visitMessage.ts", "packBands.ts", "packBandsExport.ts", "PackBands.tsx", "packNearest.ts", "PackNearest.tsx", "placeSheet.ts", "placeSheetExport.ts", "PlaceSheet.tsx", "ShortlistFiles.tsx", "gapMatrix.ts", "gapMatrixExport.ts", "GapMatrix.tsx", "placeSheetText.ts", "streetAddress.ts", "streetIndex.ts", "streetIndexExport.ts", "StreetIndex.tsx", "handout.ts", "handoutHtml.ts", "Handout.tsx", "listTransfer.ts", "ListTransfer.tsx", "aroundBearing.ts", "aroundSearch.ts", "aroundRings.ts", "aroundFilter.ts", "aroundCopy.ts", "aroundExport.ts", "AroundPlace.tsx", "textMap.ts", "textMapExport.ts", "TextMap.tsx", "placeMatrix.ts", "placeMatrixExport.ts", "DistanceMatrix.tsx"];

/** Text parts of every string literal. For a template, the `${...}` code is dropped and its own literals are read separately. */
function stringLiterals(source: string): string[] {
  const out: string[] = [];
  let i = 0;
  const readTemplate = (): void => {
    let text = "";
    i += 1;
    while (i < source.length && source[i] !== "`") {
      if (source[i] === "\\") {
        text += source.slice(i, i + 2);
        i += 2;
      } else if (source[i] === "$" && source[i + 1] === "{") {
        let depth = 1;
        i += 2;
        const start = i;
        while (i < source.length && depth > 0) {
          if (source[i] === "{") depth += 1;
          else if (source[i] === "}") depth -= 1;
          i += 1;
        }
        out.push(...stringLiterals(source.slice(start, i - 1)));
        text += "X";
      } else {
        text += source[i];
        i += 1;
      }
    }
    i += 1;
    out.push(text);
  };
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
    } else if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (ch === "`") readTemplate();
    else if (ch === '"') {
      let text = "";
      i += 1;
      while (i < source.length && source[i] !== '"' && source[i] !== "\n") {
        if (source[i] === "\\") {
          text += source.slice(i, i + 2);
          i += 2;
        } else {
          text += source[i];
          i += 1;
        }
      }
      i += 1;
      out.push(text);
    } else i += 1;
  }
  return out;
}

/** The text a literal holds once its \uXXXX and \xNN escapes are read, so an escaped no-break space counts as one. */
function decodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_m, u: string | undefined, x: string | undefined) => String.fromCharCode(parseInt((u ?? x)!, 16)));
}

describe("French source text in the shortlist and kinds modules", () => {
  for (const file of FILES) {
    it(`${file}: no plain space before : ; ! ? or inside « »`, () => {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      // Only strings that read as French are checked: an English sentence may have a plain space before nothing in particular.
      const french = stringLiterals(source).map(decodeEscapes).filter((s) => /[éèêàçôûîœ’]|\b(le|la|les|des|une|dans|pour|sur|est|sont)\b/.test(s));
      expect(french.filter((s) => / [:;!?]/.test(s))).toEqual([]);
      expect(french.filter((s) => /«[^\u202f]|[^\u202f]»/.test(s))).toEqual([]);
    });
  }
});
