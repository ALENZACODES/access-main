import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { parsePackSearch } from "./packSearchParse";
import * as h from "./packSearchHelp";
import { lintFrench } from "./typography";

describe("search examples", () => {
  for (const l of ["en", "fr"] as const) {
    it(`has seven different examples in ${l}, each with a meaning`, () => {
      const ex = h.searchExamples(l);
      expect(ex).toHaveLength(7);
      expect(new Set(ex.map((e) => e.text)).size).toBe(7);
      expect(new Set(ex.map((e) => e.meaning)).size).toBe(7);
      for (const e of ex) {
        expect(e.text.trim()).toBe(e.text);
        expect(e.meaning).toMatch(/\.$/);
      }
    });
    it(`has examples that the search reads without a problem in ${l}`, () => {
      for (const e of h.searchExamples(l)) {
        const parsed = parsePackSearch(e.text);
        expect(parsed.clauses.length, e.text).toBeGreaterThan(0);
        expect(parsed.problems, e.text).toEqual([]);
      }
    });
    it(`has meanings that pass the copy lint in ${l}`, () => {
      for (const e of h.searchExamples(l)) {
        expect(lintCopy(e.meaning, l), e.meaning).toEqual([]);
        if (l === "fr") expect(lintFrench(e.meaning), e.meaning).toEqual([]);
      }
    });
  }
  it("has the same shape in both languages: the same number of operators and quotation marks", () => {
    const en = h.searchExamples("en");
    const fr = h.searchExamples("fr");
    expect(fr.map((e) => (e.text.match(/"/g) ?? []).length)).toEqual(en.map((e) => (e.text.match(/"/g) ?? []).length));
    expect(fr.map((e) => (e.text.match(/:/g) ?? []).length)).toEqual(en.map((e) => (e.text.match(/:/g) ?? []).length));
  });
  it("uses the French words in the French examples", () => {
    const fr = h.searchExamples("fr").map((e) => e.text).join(" ");
    expect(fr).toContain(" OU ");
    expect(fr).toContain("genre:");
    expect(fr).toContain("sans:");
  });
  it("returns a new list each time, so a caller cannot change the next one", () => {
    const a = h.searchExamples("en");
    a.pop();
    expect(h.searchExamples("en")).toHaveLength(7);
  });
});

describe("search help words", () => {
  const all = (l: "en" | "fr") => [
    h.searchHelpHeading(l), h.searchHelpToggle(true, l), h.searchHelpToggle(false, l), h.searchHelpIntro(l), h.searchTryLabel(l), h.searchExampleCount(0, l), h.searchExampleCount(1, l), h.searchExampleCount(2, l),
    h.searchEchoHeading(l), h.searchProblemsHeading(l), h.searchWhyHeading(l), h.searchWhyIntro(l), h.searchWhyNoSingle(l),
  ];
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const s of all(l)) {
        expect(lintCopy(s, l), s).toEqual([]);
        if (l === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    });
    it(`says different things for open and closed in ${l}`, () => expect(h.searchHelpToggle(true, l)).not.toBe(h.searchHelpToggle(false, l)));
  }
  it("agrees in number", () => {
    expect(h.searchExampleCount(1, "en")).toBe("1 place in the pack");
    expect(h.searchExampleCount(0, "en")).toBe("0 places in the pack");
    expect(h.searchExampleCount(12, "en")).toBe("12 places in the pack");
    expect(h.searchExampleCount(1, "fr")).toBe("1 lieu dans le pack");
    expect(h.searchExampleCount(2, "fr")).toBe("2 lieux dans le pack");
  });
  it("says it only counts and does not say which part is wrong", () => {
    expect(h.searchWhyIntro("en")).toContain("does not say which part is wrong");
    expect(h.searchWhyNoSingle("en")).toBe("Taking out any one part still finds nothing.");
  });
});

describe("the why-nothing-matched lines", () => {
  it("quote what was typed and count places on its own and without it", () => {
    expect(h.searchWhyLine("tag:no", 1, 2, "en")).toBe("“tag:no” finds 1 place on its own. Without it, the search finds 2 places.");
    expect(h.searchWhyLine("tag:no", 0, 1, "en")).toBe("“tag:no” finds 0 places on its own. Without it, the search finds 1 place.");
  });
  it("is in French with French quotation marks and plural", () => {
    const s = h.searchWhyLine("tag:no", 1, 2, "fr");
    expect(s.startsWith("«\u202ftag:no\u202f» trouve 1 lieu à lui seul.")).toBe(true);
    expect(s).toContain("2 lieux");
  });
  it("adds what was typed as it is, with no change to its text", () => {
    const typed = "a<b & \"c\" l'été;!?";
    expect(h.searchWhyLine(typed, 1, 1, "fr")).toContain(typed);
    expect(h.searchWhyLine(typed, 1, 1, "en")).toContain(typed);
    expect(h.searchWhyTakeOut(typed, "en")).toBe(`Take out “${typed}”`);
    expect(h.searchWhyTakeOut(typed, "fr")).toBe(`Retirer «\u202f${typed}\u202f»`);
  });
  it("is quiet about which is right", () => {
    for (const l of ["en", "fr"] as const) expect(h.searchWhyLine("x", 0, 0, l).toLowerCase()).not.toMatch(/wrong|should|mistake|faute|erreur/);
  });
});
