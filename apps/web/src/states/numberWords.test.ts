import { describe, expect, it } from "vitest";
import { MAX_SPOKEN_NUMBER, digitWords, numberWords } from "./numberWords";

describe("numberWords in English", () => {
  it.each([
    [0, "zero"], [1, "one"], [7, "seven"], [10, "ten"], [11, "eleven"], [13, "thirteen"], [15, "fifteen"], [19, "nineteen"], [20, "twenty"], [21, "twenty-one"], [40, "forty"], [42, "forty-two"],
    [58, "fifty-eight"], [80, "eighty"], [99, "ninety-nine"], [100, "one hundred"], [101, "one hundred one"], [110, "one hundred ten"], [119, "one hundred nineteen"], [120, "one hundred twenty"],
    [123, "one hundred twenty-three"], [200, "two hundred"], [999, "nine hundred ninety-nine"], [1000, "one thousand"], [1001, "one thousand one"], [1010, "one thousand ten"],
    [1100, "one thousand one hundred"], [2650, "two thousand six hundred fifty"], [9999, "nine thousand nine hundred ninety-nine"], [10000, "ten thousand"], [12345, "twelve thousand three hundred forty-five"],
    [20000, "twenty thousand"], [99999, "ninety-nine thousand nine hundred ninety-nine"],
  ])("writes %i as %j", (n, words) => {
    expect(numberWords(n, "en")).toBe(words);
  });
  it("never uses and, a comma or a capital", () => {
    for (let n = 0; n <= 3000; n += 7) expect(numberWords(n, "en")).toMatch(/^[a-z]+(?:[ -][a-z]+)*$/);
    expect(numberWords(1234, "en")).not.toMatch(/\band\b/);
  });
});

describe("numberWords in French", () => {
  it.each([
    [0, "zéro"], [1, "un"], [9, "neuf"], [10, "dix"], [11, "onze"], [16, "seize"], [17, "dix-sept"], [19, "dix-neuf"], [20, "vingt"], [21, "vingt et un"], [22, "vingt-deux"], [31, "trente et un"],
    [45, "quarante-cinq"], [60, "soixante"], [61, "soixante et un"], [69, "soixante-neuf"], [70, "soixante-dix"], [71, "soixante et onze"], [72, "soixante-douze"], [77, "soixante-dix-sept"],
    [79, "soixante-dix-neuf"], [80, "quatre-vingts"], [81, "quatre-vingt-un"], [85, "quatre-vingt-cinq"], [90, "quatre-vingt-dix"], [91, "quatre-vingt-onze"], [97, "quatre-vingt-dix-sept"],
    [99, "quatre-vingt-dix-neuf"], [100, "cent"], [101, "cent un"], [180, "cent quatre-vingts"], [199, "cent quatre-vingt-dix-neuf"], [200, "deux cents"], [201, "deux cent un"],
    [280, "deux cent quatre-vingts"], [300, "trois cents"], [999, "neuf cent quatre-vingt-dix-neuf"], [1000, "mille"], [1001, "mille un"], [1100, "mille cent"], [1200, "mille deux cents"],
    [1980, "mille neuf cent quatre-vingts"], [2000, "deux mille"], [2021, "deux mille vingt et un"], [2650, "deux mille six cent cinquante"], [10000, "dix mille"], [21000, "vingt et un mille"],
    [80000, "quatre-vingt mille"], [81000, "quatre-vingt-un mille"], [100000 - 1, "quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf"],
  ])("writes %i as %j", (n, words) => {
    expect(numberWords(n, "fr")).toBe(words);
  });
  it("puts an s on cent and quatre-vingt only when nothing follows", () => {
    expect(numberWords(400, "fr")).toBe("quatre cents");
    expect(numberWords(80, "fr")).toBe("quatre-vingts");
    expect(numberWords(80081, "fr")).toBe("quatre-vingt mille quatre-vingt-un");
    expect(numberWords(80080, "fr")).toBe("quatre-vingt mille quatre-vingts");
    expect(numberWords(2200, "fr")).toBe("deux mille deux cents");
    expect(numberWords(2201, "fr")).toBe("deux mille deux cent un");
  });
  it("keeps mille invariable and never says un mille", () => {
    for (let n = 1000; n <= 99999; n += 313) expect(numberWords(n, "fr"), String(n)).not.toMatch(/milles/);
    for (let n = 1000; n < 2000; n += 13) expect(numberWords(n, "fr"), String(n)).toMatch(/^mille/);
  });
  it("only ever uses hyphens and spaces the way the standard form does", () => {
    for (let n = 0; n <= 3000; n += 7) expect(numberWords(n, "fr"), String(n)).toMatch(/^[a-zéèêîô]+(?:[ -][a-zéèêîô]+)*$/);
  });
});

describe("numberWords limits", () => {
  it.each([-1, 1.5, NaN, Infinity, MAX_SPOKEN_NUMBER + 1, 1e9])("gives null for %s", (n) => {
    expect(numberWords(n, "en")).toBeNull();
    expect(numberWords(n, "fr")).toBeNull();
  });
  it("covers the whole range without failing", () => {
    for (let n = 0; n <= MAX_SPOKEN_NUMBER; n += 97) {
      expect(numberWords(n, "en")).toBeTruthy();
      expect(numberWords(n, "fr")).toBeTruthy();
    }
    expect(numberWords(MAX_SPOKEN_NUMBER, "en")).toBeTruthy();
  });
  it("gives a different word string for every number in a stretch", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 2000; n += 1) seen.add(numberWords(n, "en")!);
    expect(seen.size).toBe(2000);
    const fr = new Set<string>();
    for (let n = 0; n < 2000; n += 1) fr.add(numberWords(n, "fr")!);
    expect(fr.size).toBe(2000);
  });
});

describe("digitWords", () => {
  it("reads each digit on its own", () => {
    expect(digitWords("2650", "en")).toBe("two six five zero");
    expect(digitWords("2650", "fr")).toBe("deux six cinq zéro");
  });
  it("drops everything that is not a digit", () => {
    expect(digitWords("12A-14", "en")).toBe("one two one four");
    expect(digitWords("", "en")).toBe("");
    expect(digitWords("abc", "fr")).toBe("");
  });
  it("does not read non-ASCII digits as digits", () => {
    expect(digitWords("٣", "en")).toBe("");
  });
});
