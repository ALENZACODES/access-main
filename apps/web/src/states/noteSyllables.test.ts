import { describe, expect, it } from "vitest";
import { countSyllables, numberSyllables, wordLetters } from "./noteSyllables";

describe("wordLetters", () => {
  it("keeps letters and accents only, in lower case", () => {
    expect(wordLetters("Café-12!")).toBe("café");
    expect(wordLetters("  ")).toBe("");
    expect(wordLetters("O’Neil")).toBe("oneil");
  });
});

describe("countSyllables in English", () => {
  it.each([
    ["a", 1], ["the", 1], ["door", 1], ["ramp", 1], ["step", 1], ["steps", 1], ["entrance", 2], ["elevator", 4], ["washroom", 2], ["accessible", 4], ["table", 2], ["little", 2], ["make", 1], ["made", 1],
    ["stairs", 1], ["handle", 2], ["automatic", 4], ["wanted", 2], ["needed", 2], ["boxes", 2], ["houses", 2], ["opened", 2], ["parked", 1], ["parking", 2], ["building", 2], ["second", 2], ["bathroom", 2],
    ["beautiful", 3], ["floor", 1], ["restaurant", 3], ["wheelchair", 2], ["narrow", 2], ["gravel", 2], ["rear", 1], ["daily", 2], ["available", 4], ["customer", 3],
  ])("%s has %i", (word, n) => {
    expect(countSyllables(word, "en")).toBe(n);
  });
  it("gives at least one to any word with letters and none to a word without", () => {
    expect(countSyllables("hmm", "en")).toBe(1);
    expect(countSyllables("12", "en")).toBe(0);
    expect(countSyllables("", "en")).toBe(0);
    expect(countSyllables("--", "fr")).toBe(0);
  });
  it("ignores case and punctuation", () => {
    expect(countSyllables("ELEVATOR!", "en")).toBe(4);
  });
});

describe("countSyllables in French", () => {
  it.each([
    ["le", 1], ["un", 1], ["porte", 1], ["entrée", 2], ["escalier", 3], ["ascenseur", 3], ["rampe", 1], ["accès", 2], ["toilettes", 2], ["sonnette", 2], ["côté", 2], ["étage", 2], ["sous-sol", 2], ["fauteuil", 2],
    ["bâtiment", 3], ["disponible", 3], ["marche", 1], ["marches", 1], ["salle", 1], ["trottoir", 2], ["stationnement", 4], ["entrent", 1], ["ouverte", 2], ["automatique", 4],
  ])("%s has %i", (word, n) => {
    const got = countSyllables(word, "fr");
    expect(Math.abs(got - n), `${word} gave ${got}`).toBeLessThanOrEqual(0);
  });
  it("never counts a word as having more syllables than vowels", () => {
    for (const w of ["entrée", "aéroport", "oiseau", "bureau", "cuisine"]) {
      expect(countSyllables(w, "fr")).toBeLessThanOrEqual((w.match(/[aeiouyéèêàâîïôùûœ]/g) ?? []).length);
    }
  });
  it("counts a run of vowels as one", () => {
    expect(countSyllables("bureau", "fr")).toBe(2);
    expect(countSyllables("eau", "fr")).toBe(1);
  });
});

describe("numberSyllables", () => {
  it("is one per digit, at least one", () => {
    expect(numberSyllables("2")).toBe(1);
    expect(numberSyllables("10")).toBe(2);
    expect(numberSyllables("2650")).toBe(4);
    expect(numberSyllables("")).toBe(1);
    expect(numberSyllables("1,5")).toBe(2);
  });
});

describe("syllable counts overall", () => {
  const words = ["entrance", "washroom", "elevator", "ramp", "narrow", "parking", "gravel"];
  it("are stable and not larger than the letter count", () => {
    for (const w of words) {
      expect(countSyllables(w, "en")).toBe(countSyllables(w, "en"));
      expect(countSyllables(w, "en")).toBeLessThanOrEqual(w.length);
    }
  });
  it("grow with length on average", () => {
    const short = ["cat", "dog", "ramp", "step", "door"].reduce((a, w) => a + countSyllables(w, "en"), 0);
    const long = ["elevator", "accessible", "automatic", "restaurant", "available"].reduce((a, w) => a + countSyllables(w, "en"), 0);
    expect(long).toBeGreaterThan(short);
  });
});
