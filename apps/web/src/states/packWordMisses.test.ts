import { describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { searchPlaces } from "./packSearchFixtures";
import { parsePackSearch } from "./packSearchParse";
import { filterBySearch } from "./packSearchMatch";
import { MISSING_WORDS_MAX, findMissingWords, replaceTypedWord, searchFindsNothing } from "./packWordMisses";

const places = [
  ...searchPlaces(),
  place("s1", { name: "Starbucks", category: "cafe", address: "1 Yonge Street" }),
  place("t1", { name: "Post Office Annex", category: "post_office", address: null }),
];
const miss = (q: string, ps = places) => findMissingWords(ps, q, parsePackSearch(q));

describe("replaceTypedWord", () => {
  it("swaps the word and keeps everything else as typed", () => {
    expect(replaceTypedWord("Starbuks  main", "starbuks", "starbucks")).toBe("starbucks  main");
  });
  it("keeps a field before the word", () => {
    expect(replaceTypedWord("kind:pharmacie tag:yes", "pharmacie", "pharmacy")).toBe("kind:pharmacy tag:yes");
    expect(replaceTypedWord("nom:Starbuks", "starbuks", "starbucks")).toBe("nom:starbucks");
  });
  it("folds accents and capitals to find the word, and drops its quotes", () => {
    expect(replaceTypedWord("Épicerie bar", "epicerie", "supermarket")).toBe("supermarket bar");
    expect(replaceTypedWord('"cafe" bar', "cafe", "cafes")).toBe("cafes bar");
  });
  it("adds a field in front of a word that has none, only when asked", () => {
    expect(replaceTypedWord("poste main", "poste", "post office", "kind")).toBe('kind:"post office" main');
    expect(replaceTypedWord("nom:poste", "poste", "post office", "kind")).toBe('nom:"post office"');
    expect(replaceTypedWord("poste", "poste", "post", undefined)).toBe("post");
  });
  it("puts a replacement of several words in quotes", () => {
    expect(replaceTypedWord("poste main", "poste", "post office")).toBe('"post office" main');
    expect(replaceTypedWord("kind:poste", "poste", "post office")).toBe('kind:"post office"');
  });
  it("leaves a word that is asked to be left out", () => {
    expect(replaceTypedWord("-starbuks starbuks", "starbuks", "starbucks")).toBe("-starbuks starbucks");
  });
  it("swaps every copy of the word and none of another", () => {
    expect(replaceTypedWord("bar OR bar baru", "bar", "bars")).toBe("bars OR bars baru");
  });
  it("returns text with no match, spaces and the empty string unchanged", () => {
    for (const s of ["", "   ", "main street", "a  b "]) expect(replaceTypedWord(s, "zzz", "yyy")).toBe(s);
  });
  it("does not run what was typed through anything: odd characters come back as they were", () => {
    expect(replaceTypedWord("l’étoile starbuks", "starbuks", "starbucks")).toBe("l’étoile starbucks");
    expect(replaceTypedWord("a;b starbuks!", "starbuks", "starbucks")).toBe("a;b starbuks!");
  });
});

describe("findMissingWords", () => {
  it("is empty when every word is found, with plain words, fields and phrases", () => {
    for (const q of ["", "cafe", "main street", "kind:cafe", "note:ramp", '"main street"', "starbucks"]) expect(miss(q), q).toEqual([]);
  });
  it("lists a word no place has, with the field it was looked for in", () => {
    const m = miss("starbuks");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ word: "starbuks", field: "any" });
    expect(m[0]!.options).toEqual([{ text: "starbucks", places: 1, reason: "spelling", searchText: "starbucks" }]);
  });
  it("keeps the rest of the search in the replacement", () => {
    expect(miss("starbuks yonge")[0]!.options[0]!.searchText).toBe("starbucks yonge");
    expect(miss("tag:yes starbuks")[0]!.options[0]!.searchText).toBe("tag:yes starbucks");
  });
  it("looks in the field typed", () => {
    expect(miss("name:starbuks")[0]).toMatchObject({ field: "name" });
    expect(miss("address:starbuks")[0]).toMatchObject({ field: "address", options: [] });
    expect(miss("note:starbuks")[0]).toMatchObject({ field: "note", options: [] });
  });
  it("offers the kind the pack names for a French word", () => {
    const m = miss("pharmacie");
    expect(m[0]!.options[0]).toEqual({ text: "pharmacy", places: 1, reason: "french-kind", searchText: "pharmacy" });
    expect(miss("poste")[0]!.options[0]).toMatchObject({ text: "post office", searchText: 'kind:"post office"', places: 1 });
  });
  it("counts places with the search itself, not with the word index", () => {
    // "post office" is one place; "pharmacy" appears in a kind and nowhere else.
    expect(miss("poste")[0]!.options[0]!.places).toBe(filterBySearch(places, parsePackSearch('kind:"post office"')).length);
    for (const m of miss("starbuks pharmacie")) for (const o of m.options) expect(o.places).toBeGreaterThan(0);
  });
  it("lists a word typed with an apostrophe or a hyphen, and looks for it without", () => {
    const m = miss("l'etoile");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ word: "l'etoile", field: "any" });
    expect(m[0]!.options.map((o) => o.text)).toEqual(["etoile"]);
    expect(m[0]!.options[0]!.searchText).toBe("etoile");
    expect(miss("x-yyyy")[0]!.options).toEqual([]);
  });
  it("never lists a word asked to be left out, a phrase, a tag or a has", () => {
    for (const q of ["-starbuks", '"starbuks coffee"', "tag:no has:note no:address", "-name:zzzz"]) expect(miss(q), q).toEqual([]);
  });
  it("lists a word inside an OR even if the other side finds places", () => {
    expect(miss("cafe OR starbuks").map((m) => m.word)).toEqual(["starbuks"]);
  });
  it("lists each word once, in the order typed, up to the maximum", () => {
    expect(miss("xaaa xaaa").map((m) => m.word)).toEqual(["xaaa"]);
    expect(miss("qqqq wwww eeee rrrr tttt").map((m) => m.word)).toEqual(["qqqq", "wwww", "eeee"]);
    expect(MISSING_WORDS_MAX).toBe(3);
  });
  it("lists the same word again for a different field", () => {
    expect(miss("name:qqqq address:qqqq").map((m) => `${m.field}:${m.word}`)).toEqual(["name:qqqq", "address:qqqq"]);
  });
  it("gives no options when nothing is close, and says so by an empty list", () => {
    expect(miss("xylophone")[0]).toMatchObject({ word: "xylophone", options: [] });
  });
  it("finds nothing to say for no places", () => {
    expect(miss("starbuks", [])).toEqual([]);
  });
  it("is not fooled by inherited object names typed into the box", () => {
    for (const q of ["constructor", "__proto__", "toString", "kind:constructor"]) expect(() => miss(q), q).not.toThrow();
    expect(miss("constructor")[0]!.options).toEqual([]);
  });
  it("does not change what it was given", () => {
    const parsed = parsePackSearch("starbuks");
    const before = JSON.stringify(parsed);
    findMissingWords(places, "starbuks", parsed);
    expect(JSON.stringify(parsed)).toBe(before);
  });
  it("never offers a replacement that finds no place", () => {
    for (const q of ["starbuks", "pharmacie", "cafw", "stationnement", "banque", "stret", "mian"]) {
      for (const m of miss(q)) for (const o of m.options) {
        expect(filterBySearch(places, parsePackSearch(o.searchText)).length, `${q} -> ${o.searchText}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("words that are asked to be left out, and kinds in two parts", () => {
  it("does not list a word after a minus even when every place has it", () => {
    const all = [place("a", { name: "Main Cafe" }), place("b", { name: "Main Bar" })];
    expect(findMissingWords(all, "-main", parsePackSearch("-main"))).toEqual([]);
  });
  it("offers a two-word kind only when some place has both words in its kind", () => {
    const split = [place("a", { name: "A", category: "post_box" }), place("b", { name: "B", category: "office_supplies" })];
    const m = findMissingWords(split, "poste", parsePackSearch("poste"));
    expect(m[0]!.options.some((o) => o.text === "post office")).toBe(false);
    const whole = [...split, place("c", { name: "C", category: "post_office" })];
    expect(findMissingWords(whole, "poste", parsePackSearch("poste"))[0]!.options[0]).toMatchObject({ text: "post office", places: 1, searchText: 'kind:"post office"' });
  });
});

describe("searchFindsNothing", () => {
  it("is true for a search with words that finds no place, false for no search or a match", () => {
    expect(searchFindsNothing(places, parsePackSearch("zzzz"))).toBe(true);
    expect(searchFindsNothing(places, parsePackSearch(""))).toBe(false);
    expect(searchFindsNothing(places, parsePackSearch("cafe"))).toBe(false);
    expect(searchFindsNothing([], parsePackSearch("cafe"))).toBe(true);
  });
});
