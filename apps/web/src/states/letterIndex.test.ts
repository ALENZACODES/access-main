import { describe, expect, it } from "vitest";
import { LETTER_INDEX_MIN_PLACES, type LetterItem, buildLetterIndex, letterButtonName, letterOf, showLetterIndex } from "./letterIndex";
import { lcg } from "./placeFixtures";

const named = (name: string): LetterItem => ({ name, nameKnown: true });
const unnamed: LetterItem = { name: "UNKNOWN", nameKnown: false };

describe("letterOf", () => {
  it("files a name under its first letter, upper case", () => {
    expect(letterOf(named("alpha cafe"))).toBe("A");
    expect(letterOf(named("Zed"))).toBe("Z");
  });
  it("removes accents, so É and E are one letter", () => {
    expect(letterOf(named("Église Saint-Paul"))).toBe("E");
    expect(letterOf(named("Élan"))).toBe("E");
    expect(letterOf(named("Çà et là"))).toBe("C");
    expect(letterOf(named("Øst"))).toBe("O");
  });
  it("reads ligatures the way the search does", () => {
    expect(letterOf(named("Œuvre"))).toBe("O");
    expect(letterOf(named("Æon"))).toBe("A");
  });
  it("skips leading punctuation and quotes", () => {
    expect(letterOf(named("“Café” Rouge"))).toBe("C");
    expect(letterOf(named("  -- Bar"))).toBe("B");
    expect(letterOf(named("L’Île"))).toBe("L");
  });
  it("files a digit, a non-Latin name and a name with no letter under #", () => {
    expect(letterOf(named("7 Eleven"))).toBe("#");
    expect(letterOf(named("東京カフェ"))).toBe("#");
    expect(letterOf(named("!!!"))).toBe("#");
    expect(letterOf(named(""))).toBe("#");
  });
  it("files a place with no name under UNKNOWN, even if its text looks like a letter", () => {
    expect(letterOf(unnamed)).toBe("UNKNOWN");
    expect(letterOf({ name: "Alpha", nameKnown: false })).toBe("UNKNOWN");
  });
  it("never uses the French word for UNKNOWN", () => {
    expect(letterOf(unnamed)).not.toMatch(/inconnu/i);
  });
});

describe("buildLetterIndex", () => {
  const items = [named("Beta"), named("alpha"), named("Bravo"), unnamed, named("9 Lives"), named("Éclair"), named("Echo")];
  it("lists each letter once, in order: letters, then #, then UNKNOWN", () => {
    expect(buildLetterIndex(items).map((g) => g.key)).toEqual(["A", "B", "E", "#", "UNKNOWN"]);
  });
  it("counts the places under each letter", () => {
    expect(Object.fromEntries(buildLetterIndex(items).map((g) => [g.key, g.count]))).toEqual({ A: 1, B: 2, E: 2, "#": 1, UNKNOWN: 1 });
  });
  it("gives the position of the first place of each letter in the list as shown", () => {
    expect(Object.fromEntries(buildLetterIndex(items).map((g) => [g.key, g.firstIndex]))).toEqual({ A: 1, B: 0, E: 5, "#": 4, UNKNOWN: 3 });
  });
  it("is empty for an empty list", () => {
    expect(buildLetterIndex([])).toEqual([]);
  });
  it("does not depend on the order of the list for the letters, only for the positions", () => {
    const rev = [...items].reverse();
    expect(buildLetterIndex(rev).map((g) => g.key)).toEqual(["A", "B", "E", "#", "UNKNOWN"]);
    expect(buildLetterIndex(rev).find((g) => g.key === "B")!.firstIndex).toBe(rev.length - 1 - 2);
  });
  it("keeps its invariants on 300 random lists", () => {
    const next = lcg(11);
    const pool = ["Alpha", "Éclair", "bar", "7 Eleven", "東京", "!!", "Zed", "ça", "Œuf"];
    for (let round = 0; round < 300; round++) {
      const list: LetterItem[] = Array.from({ length: Math.floor(next() * 40) }, () => (next() < 0.1 ? unnamed : named(pool[Math.floor(next() * pool.length)]!)));
      const groups = buildLetterIndex(list);
      expect(groups.reduce((n, g) => n + g.count, 0)).toBe(list.length);
      for (const g of groups) {
        expect(letterOf(list[g.firstIndex]!)).toBe(g.key);
        expect(list.slice(0, g.firstIndex).some((i) => letterOf(i) === g.key)).toBe(false);
      }
      expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
    }
  });
});

describe("showLetterIndex", () => {
  const two = buildLetterIndex([named("a"), named("b")]);
  it("needs the minimum number of places and at least two letters", () => {
    expect(showLetterIndex(two, LETTER_INDEX_MIN_PLACES)).toBe(true);
    expect(showLetterIndex(two, LETTER_INDEX_MIN_PLACES - 1)).toBe(false);
    expect(showLetterIndex(buildLetterIndex([named("a"), named("a")]), 50)).toBe(false);
    expect(showLetterIndex([], 50)).toBe(false);
  });
});

describe("letterButtonName", () => {
  it("says the letter and the number of places, singular and plural", () => {
    expect(letterButtonName({ key: "B", count: 1, firstIndex: 0 }, "en")).toBe("B, 1 place");
    expect(letterButtonName({ key: "B", count: 3, firstIndex: 0 }, "en")).toBe("B, 3 places");
  });
  it("uses French plural rules (0 and 1 are singular)", () => {
    expect(letterButtonName({ key: "B", count: 1, firstIndex: 0 }, "fr")).toBe("B, 1 lieu");
    expect(letterButtonName({ key: "B", count: 2, firstIndex: 0 }, "fr")).toBe("B, 2 lieux");
  });
  it("names the # group in words and keeps UNKNOWN as the token", () => {
    expect(letterButtonName({ key: "#", count: 2, firstIndex: 0 }, "en")).toBe("Digits and others, 2 places");
    expect(letterButtonName({ key: "#", count: 2, firstIndex: 0 }, "fr")).toBe("Chiffres et autres, 2 lieux");
    expect(letterButtonName({ key: "UNKNOWN", count: 1, firstIndex: 0 }, "fr")).toBe("UNKNOWN, 1 lieu");
  });
});
