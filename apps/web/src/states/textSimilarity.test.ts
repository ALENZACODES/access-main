import { describe, expect, it } from "vitest";
import { editDistance, editSimilarity, jaroWinkler, nameSimilarity, wordOverlap, wordSet } from "./textSimilarity";

describe("editDistance", () => {
  it.each([["", "", 0], ["a", "", 1], ["", "abc", 3], ["kitten", "sitting", 3], ["flaw", "lawn", 2], ["same", "same", 0], ["ab", "ba", 2], ["café", "cafe", 1], ["abc", "abd", 1]])("%j to %j is %i", (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });
  it("is symmetric", () => {
    for (const [a, b] of [["kitten", "sitting"], ["alpha", "beta"], ["", "x"]] as const) expect(editDistance(a, b)).toBe(editDistance(b, a));
  });
  it("stops early and reports more than the limit", () => {
    expect(editDistance("aaaaaaaa", "bbbbbbbb", 2)).toBe(3);
    expect(editDistance("abc", "abcdefghij", 2)).toBe(3);
    expect(editDistance("kitten", "sitting", 3)).toBe(3);
    expect(editDistance("", "abcd", 2)).toBe(3);
  });
  it("counts an emoji as one character", () => {
    expect(editDistance("a😀", "a")).toBe(1);
  });
});

describe("editSimilarity", () => {
  it("is 1 for the same text and 0 for blanks", () => {
    expect(editSimilarity("cafe", "cafe")).toBe(1);
    expect(editSimilarity("", "")).toBe(0);
    expect(editSimilarity("", "a")).toBe(0);
  });
  it("is the share of letters kept", () => {
    expect(editSimilarity("cafe", "cafes")).toBeCloseTo(0.8, 6);
    expect(editSimilarity("abcd", "wxyz")).toBe(0);
  });
});

describe("jaroWinkler", () => {
  it("is 1 for the same text and 0 for blanks or nothing shared", () => {
    expect(jaroWinkler("alpha", "alpha")).toBe(1);
    expect(jaroWinkler("", "a")).toBe(0);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });
  it("matches the known value for martha and marhta", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.9611, 3);
  });
  it("rewards a shared start", () => {
    expect(jaroWinkler("dixon", "dicksonx")).toBeGreaterThan(jaroWinkler("xdixon", "dicksonx"));
  });
  it("stays between 0 and 1 and is symmetric", () => {
    for (const [a, b] of [["alpha hall", "alpha hal"], ["beta", "alpha"], ["a", "ab"], ["main street cafe", "cafe main street"]] as const) {
      const s = jaroWinkler(a, b);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
      expect(jaroWinkler(b, a)).toBeCloseTo(s, 10);
    }
  });
  it("scores a one-letter slip high and different names low", () => {
    expect(jaroWinkler("quesnel library", "quesnell library")).toBeGreaterThan(0.95);
    expect(jaroWinkler("quesnel library", "beta court")).toBeLessThan(0.6);
  });
});

describe("wordSet and wordOverlap", () => {
  it("keeps each word once, in order", () => {
    expect(wordSet("a b a  c b")).toEqual(["a", "b", "c"]);
    expect(wordSet("")).toEqual([]);
  });
  it("is 1 for the same words in any order and 0 for none shared", () => {
    expect(wordOverlap("main street cafe", "cafe main street")).toBe(1);
    expect(wordOverlap("alpha", "beta")).toBe(0);
    expect(wordOverlap("", "beta")).toBe(0);
  });
  it("is the shared share of all words", () => {
    expect(wordOverlap("a b c", "b c d")).toBeCloseTo(2 / 4, 10);
  });
});

describe("nameSimilarity", () => {
  it("is 0 when either name is blank", () => {
    expect(nameSimilarity("", "x")).toBe(0);
    expect(nameSimilarity("x", "")).toBe(0);
  });
  it("is high for a reordered name, a slip, and the same name", () => {
    expect(nameSimilarity("king street cafe", "cafe king street")).toBe(1);
    expect(nameSimilarity("quesnel library", "quesnell library")).toBeGreaterThan(0.9);
    expect(nameSimilarity("alpha", "alpha")).toBe(1);
  });
  it("is low for unlike names", () => {
    expect(nameSimilarity("alpha hall", "zed pharmacy")).toBeLessThan(0.6);
  });
  it("is the best of the measures it uses", () => {
    const a = "tim hortons";
    const b = "hortons tim";
    expect(nameSimilarity(a, b)).toBe(Math.max(jaroWinkler(a, b), wordOverlap(a, b), editSimilarity(a, b)));
  });
});
