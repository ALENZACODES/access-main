import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { filterBySearch } from "./packSearchMatch";
import { parsePackSearch } from "./packSearchParse";
import { parsePackPlaces } from "./packPlaces";
import { WORD_FIELDS, buildWordIndex, wordList, wordTokens } from "./packWordIndex";
import { findMissingWords } from "./packWordMisses";
import { FRENCH_KIND_WORDS, frenchKindWord } from "./packWordNear";

type Raw = Record<string, unknown> & { id: string };
const raw = (JSON.parse(contentText) as { places: Raw[] }).places;
const { places } = parsePackPlaces(raw);
const index = buildWordIndex(places);
const str = (v: unknown) => (typeof v === "string" && v.toUpperCase() !== "UNKNOWN" && v.trim() !== "" ? v : null);
const miss = (q: string) => findMissingWords(places, q, parsePackSearch(q));

describe("the word help on the shipped pack", () => {
  it("has words to list in every part that the pack fills", () => {
    expect(wordList(index, "any").length).toBeGreaterThan(30);
    expect(wordList(index, "name").length).toBeGreaterThan(20);
    expect(wordList(index, "kind").length).toBeGreaterThan(5);
    expect(wordList(index, "address").length).toBeGreaterThan(3);
  });
  it("counts each word the same as counting straight from the pack file", () => {
    const fieldOf = { any: (p: Raw) => [str(p.name), str(p.address), str(p.category)].flatMap(wordTokens), name: (p: Raw) => wordTokens(str(p.name)), address: (p: Raw) => wordTokens(str(p.address)), kind: (p: Raw) => wordTokens(str(p.category)), note: (p: Raw) => wordTokens(str(p.wheelchair_description)) };
    for (const f of WORD_FIELDS) {
      for (const { word, places: n } of wordList(index, f)) {
        expect(n, `${f}:${word}`).toBe(raw.filter((p) => fieldOf[f](p).includes(word)).length);
      }
    }
  });
  it("finds at least one place for every word in the list, and reports no missing word for it", () => {
    for (const { word } of wordList(index, "any")) {
      expect(filterBySearch(places, parsePackSearch(word)).length, word).toBeGreaterThan(0);
      expect(miss(word), word).toEqual([]);
    }
    for (const { word } of wordList(index, "note")) expect(filterBySearch(places, parsePackSearch(`note:${word}`)).length, word).toBeGreaterThan(0);
  });
  it("finds the pack's word again from a spelling with one letter missing, for every name word of five letters or more", () => {
    let tried = 0;
    for (const { word } of wordList(index, "name")) {
      if (word.length < 5 || /\d/.test(word)) continue;
      const typo = word.slice(0, 2) + word.slice(3);
      if (wordList(index, "any").some((e) => e.word === typo)) continue;
      const m = miss(`name:${typo}`);
      if (m.length === 0) continue; // the typo happens to be inside another word
      tried += 1;
      expect(m[0]!.options.map((o) => o.text), `${word} -> ${typo}`).toContain(word);
      for (const o of m[0]!.options) expect(filterBySearch(places, parsePackSearch(o.searchText)).length, o.searchText).toBeGreaterThan(0);
    }
    expect(tried).toBeGreaterThan(5);
  });
  it("helps with a misspelt name the pack has", () => {
    expect(miss("starbuks")[0]!.options.map((o) => o.text)).toContain("starbucks");
    expect(miss("shopers")[0]!.options.map((o) => o.text)).toContain("shoppers");
  });
  it("names a kind the pack uses for each French word, exactly when the pack has that kind", () => {
    const kinds = raw.map((p) => wordTokens(str(p.category)));
    for (const [fr, words] of Object.entries(FRENCH_KIND_WORDS)) {
      const has = kinds.some((k) => words.every((w) => k.includes(w)));
      const got = frenchKindWord(index, fr);
      if (has) expect(got, fr).not.toBeNull();
      // Where the pack has no such kind, the word is not offered unless every word of it is a kind word on its own.
      else if (!words.every((w) => kinds.some((k) => k.includes(w)))) expect(got, fr).toBeNull();
    }
    expect(frenchKindWord(index, "pharmacie")?.text).toBe("pharmacy");
    expect(frenchKindWord(index, "stationnement")?.text).toBe("parking");
    expect(frenchKindWord(index, "poste")?.text).toBe("post office");
  });
  it("finds places for every French kind word it offers", () => {
    for (const fr of Object.keys(FRENCH_KIND_WORDS)) {
      const m = miss(fr);
      for (const o of m[0]?.options ?? []) {
        expect(o.places, `${fr} -> ${o.text}`).toBeGreaterThan(0);
        // The search the button would put in the box finds exactly the places counted.
        expect(filterBySearch(places, parsePackSearch(o.searchText)).length, o.searchText).toBe(o.places);
      }
    }
  });
});
