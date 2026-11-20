import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { searchPlaces } from "./packSearchFixtures";
import { buildWordIndex } from "./packWordIndex";
import { FRENCH_KIND_WORDS, NEAR_WORDS_MAX, frenchKindWord, nearWords, spellingWords } from "./packWordNear";

const index = buildWordIndex([
  ...searchPlaces(),
  place("s1", { name: "Starbucks", category: "cafe" }),
  place("s2", { name: "Starbucks Reserve", category: "cafe" }),
  place("t1", { name: "Post Office Annex", category: "post_office", address: null }),
]);

describe("spellingWords", () => {
  it("finds a word one letter away", () => {
    expect(spellingWords(index, "name", "starbuks")).toEqual([{ text: "starbucks", places: 2, reason: "spelling" }]);
  });
  it("finds a swapped pair as one edit", () => {
    expect(spellingWords(index, "name", "startbucks").map((w) => w.text)).toContain("starbucks");
    expect(spellingWords(index, "name", "sratbucks").map((w) => w.text)).toContain("starbucks");
  });
  it("never offers the word itself", () => {
    expect(spellingWords(index, "name", "starbucks")).toEqual([]);
  });
  it("offers nothing for words of three letters or fewer", () => {
    expect(spellingWords(index, "any", "bat")).toEqual([]);
    expect(spellingWords(index, "any", "ba")).toEqual([]);
  });
  it("allows one edit up to six letters and two beyond", () => {
    expect(spellingWords(index, "name", "alpho").map((w) => w.text)).toContain("alpha");
    expect(spellingWords(index, "name", "alfo")).toEqual([]);
    expect(spellingWords(index, "name", "reserv").map((w) => w.text)).toContain("reserve");
    expect(spellingWords(index, "name", "resrve").map((w) => w.text)).toContain("reserve");
    expect(spellingWords(index, "name", "starbxxks").map((w) => w.text)).toContain("starbucks");
    expect(spellingWords(index, "name", "starbxxxs")).toEqual([]);
  });
  it("looks only in the field asked for", () => {
    expect(spellingWords(index, "address", "starbuks")).toEqual([]);
    expect(spellingWords(index, "kind", "cafw").map((w) => w.text)).toContain("cafe");
  });
  it("puts the closest first, then the word in more places, then alphabetical", () => {
    const idx = buildWordIndex([place("a", { name: "bread", address: null }), place("b", { name: "breed", address: null }), place("c", { name: "breed", address: null }), place("d", { name: "bready", address: null })]);
    expect(spellingWords(idx, "name", "brend").map((w) => w.text)).toEqual(["breed", "bread"]);
    expect(spellingWords(idx, "name", "bread").map((w) => w.text)).toEqual(["breed", "bready"]);
  });
  it("puts a closer word before a word in more places", () => {
    const idx = buildWordIndex([place("a", { name: "cardinal", address: null }), place("b", { name: "cardinals", address: null }), place("c", { name: "cardinals", address: null })]);
    // "cardinax" is one edit from cardinal and two from cardinals, which is in more places.
    expect(spellingWords(idx, "name", "cardinax").map((w) => w.text)).toEqual(["cardinal", "cardinals"]);
  });
  it("stops at the maximum, and at none when asked for none", () => {
    const names = ["bake", "bike", "bare", "bale", "bane"];
    const idx = buildWordIndex(names.map((n, i) => place(`p${i}`, { name: n, address: null })));
    expect(spellingWords(idx, "name", "bade")).toHaveLength(NEAR_WORDS_MAX);
    expect(spellingWords(idx, "name", "bade", 0)).toEqual([]);
    expect(spellingWords(idx, "name", "bade", 1)).toHaveLength(1);
  });
});

describe("frenchKindWord", () => {
  it("names the kind the pack uses when it has a place of that kind", () => {
    expect(frenchKindWord(index, "pharmacie")).toEqual({ text: "pharmacy", places: 1, reason: "french-kind" });
    expect(frenchKindWord(index, "poste")).toEqual({ text: "post office", places: 1, reason: "french-kind" });
  });
  it("says nothing for a kind the pack has no place of", () => {
    expect(frenchKindWord(index, "banque")).toBeNull();
    expect(frenchKindWord(buildWordIndex([]), "pharmacie")).toBeNull();
  });
  it("says nothing for a word that is not listed", () => {
    expect(frenchKindWord(index, "cafe")).toBeNull();
    expect(frenchKindWord(index, "")).toBeNull();
  });
  it("lists only folded words and kind words with no capitals", () => {
    for (const [fr, words] of Object.entries(FRENCH_KIND_WORDS)) {
      expect(fr).toBe(fr.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
      for (const w of words) expect(w).toMatch(/^[a-z]+$/);
    }
  });
  it("does not use inherited object keys", () => {
    expect(frenchKindWord(index, "constructor")).toBeNull();
    expect(frenchKindWord(index, "__proto__")).toBeNull();
    expect(frenchKindWord(index, "toString")).toBeNull();
  });
});

describe("nearWords", () => {
  it("puts the French kind before the spellings and repeats nothing", () => {
    const out = nearWords(index, "any", "pharmacie");
    expect(out[0]).toMatchObject({ text: "pharmacy", reason: "french-kind" });
    expect(new Set(out.map((o) => o.text)).size).toBe(out.length);
  });
  it("offers a French kind only where a kind is looked for", () => {
    expect(nearWords(index, "kind", "pharmacie")[0]).toMatchObject({ reason: "french-kind" });
    expect(nearWords(index, "name", "pharmacie").some((o) => o.reason === "french-kind")).toBe(false);
    expect(nearWords(index, "address", "pharmacie")).toEqual([]);
    expect(nearWords(index, "note", "pharmacie")).toEqual([]);
  });
  it("never gives more than the maximum", () => {
    for (const w of ["pharmacie", "starbuks", "street", "zzzz"]) expect(nearWords(index, "any", w).length).toBeLessThanOrEqual(NEAR_WORDS_MAX);
  });
  it("gives nothing for a word with nothing near it", () => {
    expect(nearWords(index, "any", "xylophone")).toEqual([]);
  });
});
