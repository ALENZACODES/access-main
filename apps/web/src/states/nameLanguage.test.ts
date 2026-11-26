import { describe, expect, it } from "vitest";
import { countAccents, nameWords, readNameLanguage, scriptCounts } from "./nameLanguage";
import { ENGLISH_NAME_WORDS, FRENCH_NAME_WORDS } from "./nameLexicon";

const reading = (n: string | null) => readNameLanguage(n).reading;

describe("nameWords", () => {
  it.each([
    ["Rue Saint-Jean", ["rue", "saint", "jean"]],
    ["École Sainte-Anne", ["ecole", "sainte", "anne"]],
    ["L'Église", ["l'", "eglise"]],
    ["L’Église", ["l'", "eglise"]],
    ["D’Arcy Library", ["d'", "arcy", "library"]],
    ["Tim Hortons #1234", ["tim", "hortons"]],
    ["O'Neil's Pub", ["o", "neil", "s", "pub"]],
    ["  spaced   out  ", ["spaced", "out"]],
    ["", []],
    ["123 456", []],
  ])("splits %j", (name, want) => expect(nameWords(name)).toEqual(want));
  it("folds accents", () => expect(nameWords("Bibliothèque Château Ça")).toEqual(["bibliotheque", "chateau", "ca"]));
  it("keeps l and d before an apostrophe only when a letter follows", () => {
    expect(nameWords("Jean l'")).not.toContain("l'");
    expect(nameWords("Shell'd")).not.toContain("d'");
  });
});

describe("scriptCounts", () => {
  it("counts letters and Latin letters", () => {
    expect(scriptCounts("Abc")).toEqual({ letters: 3, latin: 3 });
    expect(scriptCounts("Café 12")).toEqual({ letters: 4, latin: 4 });
    expect(scriptCounts("привет")).toEqual({ letters: 6, latin: 0 });
    expect(scriptCounts("Tim 北京")).toEqual({ letters: 5, latin: 3 });
    expect(scriptCounts("123")).toEqual({ letters: 0, latin: 0 });
  });
});

describe("countAccents", () => {
  it.each([
    ["Café", 1],
    ["Église Saint-Étienne", 2],
    ["Garçon à la plage", 2],
    ["Cœur", 1],
    ["Naïve Noël", 2],
    ["Cafe", 0],
    ["ÉCOLE", 1],
    ["München", 1],
    ["", 0],
  ])("counts %j as %i", (s, n) => expect(countAccents(s)).toBe(n));
});

describe("readNameLanguage readings", () => {
  it.each([
    ["Bibliothèque municipale", "french"],
    ["Rue Principale", "french"],
    ["École Saint-Jean", "french"],
    ["Le Petit Café", "french"],
    ["L'Église Sainte-Anne", "french"],
    ["Parc des Lilas", "french"],
    ["Pharmacie du Coin", "french"],
    ["Boulangerie Dupont", "french"],
    ["Springfield Public Library", "english"],
    ["The Corner Store", "english"],
    ["St. Paul's Church", "english"],
    ["Hospital for Sick Children", "english"],
    ["Lakeshore Park", "english"],
    ["Tim Hortons", "neither"],
    ["Smith", "neither"],
    ["Pizza Pizza", "neither"],
    ["7 Eleven", "neither"],
    ["Café", "neither"],
    ["Centre", "neither"],
    ["Hotel", "neither"],
    ["Restaurant Bar", "neither"],
    ["Bibliothèque / Library", "both"],
    ["Library of the École", "both"],
    ["Parc | Park", "both"],
    ["École Elementary School", "both"],
    ["北京图书馆", "other-script"],
    ["Библиотека", "other-script"],
    ["", "no-name"],
    ["   ", "no-name"],
  ])("reads %j as %s", (name, want) => expect(reading(name)).toBe(want));

  it("is no-name for no name", () => expect(reading(null)).toBe("no-name"));
  it("reads mostly-Latin names with a little other script by the Latin words", () => expect(reading("Library 北")).toBe("english"));
  it("reads a name with more other-script letters than Latin as other-script", () => expect(reading("Lib 北京图书馆")).toBe("other-script"));
  it("reads a name of digits and symbols as neither", () => expect(reading("#12 - 34")).toBe("neither"));
  it("ignores the case of the name", () => {
    expect(reading("BIBLIOTHÈQUE")).toBe("french");
    expect(reading("PUBLIC LIBRARY")).toBe("english");
    expect(reading("public library")).toBe("english");
  });
  it("does not read an accent alone as French", () => {
    const r = readNameLanguage("Café Zoé");
    expect(r.reading).toBe("neither");
    expect(r.accents).toBe(2);
  });
  it("does not read an accented a as the English word a", () => expect(reading("Ahmed's \u00c0 Table")).toBe("neither"));
});

describe("readNameLanguage details", () => {
  it("lists the words that decided it, each once, in order", () => {
    const r = readNameLanguage("Rue de la Rue Parc");
    expect(r.french).toEqual(["rue", "la", "parc"]);
    expect(r.english).toEqual([]);
  });
  it("lists both kinds when a name reads as both", () => {
    const r = readNameLanguage("Bibliothèque Public Library");
    expect(r).toMatchObject({ reading: "both", french: ["bibliotheque"], english: ["public", "library"] });
  });
  it("counts the elision l' and d' as French words", () => {
    expect(readNameLanguage("L'Orée").french).toEqual(["l'"]);
    expect(readNameLanguage("L'Orée").reading).toBe("french");
    expect(readNameLanguage("D’Arcy").reading).toBe("french");
  });
  it("does not count the s of a possessive as French", () => expect(readNameLanguage("Joe's Diner").french).toEqual([]));
  it("has no words for no name or another script", () => {
    expect(readNameLanguage(null)).toEqual({ reading: "no-name", french: [], english: [], accents: 0, pair: false });
    expect(readNameLanguage("Библиотека")).toEqual({ reading: "other-script", french: [], english: [], accents: 0, pair: false });
  });
  it("marks a pair of a French half and an English half", () => {
    expect(readNameLanguage("Bibliothèque / Library").pair).toBe(true);
    expect(readNameLanguage("Library | Bibliothèque").pair).toBe(true);
    expect(readNameLanguage("Bibliothèque/Library").pair).toBe(true);
  });
  it("does not mark a pair when a half has no language or both do", () => {
    expect(readNameLanguage("Bibliothèque / Smith").pair).toBe(false);
    expect(readNameLanguage("Parc / Rue").pair).toBe(false);
    expect(readNameLanguage("Library / Park").pair).toBe(false);
    expect(readNameLanguage("Bibliothèque Library").pair).toBe(false);
    expect(readNameLanguage("A / B / C").pair).toBe(false);
  });
  it("does not split on a hyphen or a comma", () => expect(readNameLanguage("Bibliothèque - Library").pair).toBe(false));
  it("keeps every word in the lexicon lists", () => {
    for (const w of readNameLanguage("Bibliothèque Public Library").french) expect(FRENCH_NAME_WORDS.has(w)).toBe(true);
    for (const w of readNameLanguage("Bibliothèque Public Library").english) expect(ENGLISH_NAME_WORDS.has(w)).toBe(true);
  });
});

describe("readNameLanguage over every lexicon word", () => {
  it("reads each French word alone as French", () => {
    for (const w of FRENCH_NAME_WORDS) expect(reading(w), w).toBe("french");
  });
  it("reads each English word alone as English", () => {
    for (const w of ENGLISH_NAME_WORDS) expect(reading(w), w).toBe("english");
  });
  it("reads each French word in capitals as French", () => {
    for (const w of FRENCH_NAME_WORDS) expect(reading(w.toUpperCase()), w).toBe("french");
  });
});
