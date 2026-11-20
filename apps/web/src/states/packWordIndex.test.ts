import { describe, expect, it } from "vitest";
import { bare, place, varied } from "./placeFixtures";
import { searchPlaces } from "./packSearchFixtures";
import { buildWordIndex, isWordField, wordList, wordPlaces, wordTokens, WORD_FIELDS, WORD_MAX_LENGTH, WORD_MIN_LENGTH } from "./packWordIndex";

describe("wordTokens", () => {
  it("folds accents and capitals and splits on anything that is not a letter or digit", () => {
    expect(wordTokens("Café Étoile, 7 rue Principale")).toEqual(["cafe", "etoile", "rue", "principale"]);
  });
  it("reads an underscore as a space, as the kind search does", () => {
    expect(wordTokens("fast_food")).toEqual(["fast", "food"]);
  });
  it("drops words shorter than the minimum, keeps digits and repeats", () => {
    expect(WORD_MIN_LENGTH).toBe(2);
    expect(wordTokens("a 7 12 Bay bay")).toEqual(["12", "bay", "bay"]);
  });
  it("drops absurdly long words", () => {
    expect(wordTokens("x".repeat(WORD_MAX_LENGTH + 1) + " ok")).toEqual(["ok"]);
    expect(wordTokens("x".repeat(WORD_MAX_LENGTH))).toHaveLength(1);
  });
  it("gives nothing for null or blank", () => {
    expect(wordTokens(null)).toEqual([]);
    expect(wordTokens("   ")).toEqual([]);
  });
  it("keeps apostrophes out of words", () => {
    expect(wordTokens("Jack Astor's")).toEqual(["jack", "astor"]);
  });
});

describe("buildWordIndex", () => {
  const index = buildWordIndex(searchPlaces());
  it("counts places, not occurrences", () => {
    const p = place("x", { name: "Main Main Main", address: "Main Street" });
    const one = buildWordIndex([p]);
    expect(wordPlaces(one, "name", "main")).toBe(1);
    expect(wordPlaces(one, "any", "main")).toBe(1);
  });
  it("keeps each field apart", () => {
    expect(wordPlaces(index, "name", "cafe")).toBe(2); // Alpha Cafe, Café Étoile
    expect(wordPlaces(index, "kind", "cafe")).toBe(2);
    expect(wordPlaces(index, "address", "street")).toBe(6);
    expect(wordPlaces(index, "note", "ramp")).toBe(1);
    expect(wordPlaces(index, "name", "ramp")).toBe(0);
  });
  it("counts a word that is in a name and a kind once in any", () => {
    expect(wordPlaces(index, "any", "cafe")).toBe(2);
    expect(wordPlaces(index, "any", "hotel")).toBe(1);
  });
  it("reads fast_food as two words in the kind", () => {
    expect(wordPlaces(index, "kind", "fast")).toBe(1);
    expect(wordPlaces(index, "kind", "food")).toBe(1);
  });
  it("is empty for no places and for places with nothing to read", () => {
    for (const f of WORD_FIELDS) {
      expect(buildWordIndex([])[f].size).toBe(0);
      expect(buildWordIndex([bare("b")])[f].size).toBe(0);
    }
  });
  it("never counts more places than there are, and does not depend on order", () => {
    for (const seed of [1, 2, 3, 4]) {
      const places = varied(seed, 40);
      const a = buildWordIndex(places);
      const b = buildWordIndex([...places].reverse());
      for (const f of WORD_FIELDS) {
        expect([...a[f]].sort()).toEqual([...b[f]].sort());
        for (const [, n] of a[f]) {
          expect(n).toBeGreaterThan(0);
          expect(n).toBeLessThanOrEqual(places.length);
        }
      }
    }
  });
  it("matches a count made by looking at each place", () => {
    const places = varied(9, 60);
    const idx = buildWordIndex(places);
    for (const [word, n] of idx.name) {
      expect(n, word).toBe(places.filter((p) => wordTokens(p.name).includes(word)).length);
    }
  });
});

describe("wordList", () => {
  const index = buildWordIndex(searchPlaces());
  it("puts the words in the most places first and breaks ties alphabetically", () => {
    const list = wordList(index, "any");
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!;
      const b = list[i]!;
      expect(a.places > b.places || (a.places === b.places && a.word < b.word), `${a.word} before ${b.word}`).toBe(true);
    }
    expect(list[0]!.word).toBe("street");
  });
  it("cuts the list at the limit and gives everything for a limit above its length", () => {
    expect(wordList(index, "any", 3)).toHaveLength(3);
    expect(wordList(index, "any", 0)).toEqual([]);
    expect(wordList(index, "any", -4)).toEqual([]);
    expect(wordList(index, "any", 10_000)).toHaveLength(index.any.size);
    expect(wordList(index, "any")).toHaveLength(index.any.size);
  });
  it("is the same for the same places in any order", () => {
    const places = varied(5, 30);
    expect(wordList(buildWordIndex(places), "address")).toEqual(wordList(buildWordIndex([...places].reverse()), "address"));
  });
});

describe("small helpers", () => {
  it("wordPlaces is 0 for a word the pack does not have", () => {
    expect(wordPlaces(buildWordIndex(searchPlaces()), "any", "zzzz")).toBe(0);
  });
  it("isWordField knows the five fields and nothing else", () => {
    for (const f of WORD_FIELDS) expect(isWordField(f)).toBe(true);
    for (const f of ["", "tag", "Name", "has"]) expect(isWordField(f)).toBe(false);
  });
});
