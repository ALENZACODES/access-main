import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { EarlierFileProblem, SkipReason } from "./packEarlier";
import { problemText, skipText } from "./packCompareCopy";
import { lintFrench } from "./typography";

const PROBLEMS: EarlierFileProblem[] = ["empty", "too-large", "too-many-rows", "unterminated-quote", "no-header", "missing-columns", "no-places"];
const REASONS: SkipReason[] = ["no-id", "bad-id", "repeated-id", "short-row", "bad-tag", "bad-position"];

describe("problemText", () => {
  for (const l of ["en", "fr"] as const) {
    it(`gives a different sentence for each problem in ${l}`, () => {
      const texts = PROBLEMS.map((p) => problemText(p, l, ["id", "name"]));
      expect(new Set(texts).size).toBe(PROBLEMS.length);
      for (const s of texts) expect(s.length).toBeGreaterThan(10);
    });
    it(`passes the copy lint in ${l}`, () => {
      for (const p of PROBLEMS) {
        const s = problemText(p, l, ["id"]);
        expect(lintCopy(s, l), s).toEqual([]);
        if (l === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    });
  }
  it("lists the missing columns, in the order given, only for the missing-columns problem", () => {
    expect(problemText("missing-columns", "en", ["place_id", "tag"])).toBe("This is not a places file saved by the App. Missing columns: place_id, tag.");
    expect(problemText("missing-columns", "fr", ["place_id", "tag"])).toContain("place_id, tag");
    expect(problemText("empty", "en", ["place_id"])).not.toContain("place_id");
  });
  it("gives the limits it enforces", () => {
    expect(problemText("too-large", "en")).toContain("5 MB");
    expect(problemText("too-many-rows", "en")).toContain("100,000");
    expect(problemText("too-large", "fr")).toContain("5 Mo");
    expect(problemText("too-many-rows", "fr")).toContain("100 000");
  });
  it("does not say that a file is wrong or corrupt", () => {
    for (const l of ["en", "fr"] as const) for (const p of PROBLEMS) expect(problemText(p, l, ["x"]).toLowerCase()).not.toMatch(/corrupt|invalid|bad file|mauvais|corrompu/);
  });
  it("says what to do about nothing: it only says what was found", () => {
    for (const p of PROBLEMS) expect(problemText(p, "en", [])).toMatch(/\.$/);
  });
});

describe("skipText", () => {
  for (const l of ["en", "fr"] as const) {
    it(`gives a different phrase for each reason in ${l}`, () => {
      expect(new Set(REASONS.map((r) => skipText(r, l))).size).toBe(REASONS.length);
    });
    it(`starts in lower case and ends with no full stop in ${l}, since it follows a row number`, () => {
      for (const r of REASONS) {
        const s = skipText(r, l);
        expect(s, s).toMatch(/^[a-zà-ÿ]/);
        expect(s, s).not.toMatch(/\.$/);
      }
    });
    it(`passes the copy lint in ${l}`, () => {
      for (const r of REASONS) {
        const s = skipText(r, l);
        expect(lintCopy(s, l), s).toEqual([]);
        if (l === "fr") expect(lintFrench(s), s).toEqual([]);
      }
    });
  }
  it("names the id rule and the tag rule", () => {
    expect(skipText("bad-id", "en")).toContain("spaces or control characters");
    expect(skipText("bad-tag", "en")).toContain("wheelchair tag");
    expect(skipText("bad-position", "en")).toContain("coordinates");
  });
});
