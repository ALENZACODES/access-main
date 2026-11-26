import { describe, expect, it } from "vitest";
import { MAX_SPELL_CHARS, SPELLING_WORDS, spellLine, spellUnits, worthSpelling } from "./spellOut";

describe("spelling alphabets", () => {
  it("cover every letter in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const c of "abcdefghijklmnopqrstuvwxyz") expect(SPELLING_WORDS[locale][c], `${locale} ${c}`).toBeTruthy();
      expect(Object.keys(SPELLING_WORDS[locale])).toHaveLength(26);
    }
  });
  it("start each word with its own letter, ignoring accents", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const [c, w] of Object.entries(SPELLING_WORDS[locale])) {
        expect(w.normalize("NFD")[0]!.toLowerCase(), `${locale} ${w}`).toBe(c);
      }
    }
  });
  it("use no word twice within a language", () => {
    for (const locale of ["en", "fr"] as const) {
      const words = Object.values(SPELLING_WORDS[locale]);
      expect(new Set(words).size).toBe(words.length);
    }
  });
});

describe("spellUnits", () => {
  it("names a plain letter in English", () => {
    const { units } = spellUnits("Bay", "en");
    expect(units.map((u) => u.say)).toEqual(["B as in Bravo", "A as in Alfa", "Y as in Yankee"]);
    expect(units.every((u) => u.kind === "letter")).toBe(true);
  });
  it("names a plain letter in French", () => {
    expect(spellUnits("Zoé", "fr").units.map((u) => u.say)).toEqual(["Z comme Zoé", "O comme Oscar", "E accent aigu comme Émile"]);
  });
  it("names accents in both languages", () => {
    expect(spellLine("é", "en")).toBe("E with an acute accent as in Echo");
    expect(spellLine("à", "en")).toBe("A with a grave accent as in Alfa");
    expect(spellLine("ê", "en")).toBe("E with a circumflex as in Echo");
    expect(spellLine("ï", "en")).toBe("I with a diaeresis as in India");
    expect(spellLine("ç", "en")).toBe("C with a cedilla as in Charlie");
    expect(spellLine("ç", "fr")).toBe("C cédille comme Célestin");
    expect(spellLine("ï", "fr")).toBe("I tréma comme Irma");
  });
  it("reads a decomposed accent the same as a composed one", () => {
    expect(spellLine("é", "en")).toBe(spellLine("é", "en"));
  });
  it("reads digits one at a time", () => {
    const { units } = spellUnits("12", "en");
    expect(units.map((u) => [u.kind, u.say])).toEqual([["digit", "one"], ["digit", "two"]]);
    expect(spellUnits("7", "fr").units[0]!.say).toBe("sept");
  });
  it("names common symbols", () => {
    expect(spellUnits("a-b", "en").units[1]!.say).toBe("hyphen");
    expect(spellUnits("a-b", "fr").units[1]!.say).toBe("trait d’union");
    expect(spellUnits("l'a", "en").units[1]!.say).toBe("apostrophe");
    expect(spellUnits("l’a", "fr").units[1]!.say).toBe("apostrophe");
    expect(spellUnits("a b", "en").units[1]!.say).toBe("space");
    expect(spellUnits("a&b", "fr").units[1]!.say).toBe("esperluette");
  });
  it("names a character it has no word for instead of skipping it", () => {
    expect(spellUnits("a~b", "en").units[1]).toEqual({ char: "~", kind: "symbol", say: "the symbol “~”" });
    expect(spellUnits("a~b", "fr").units[1]!.say).toContain("~");
    expect(spellUnits("ß", "en").units[0]!.kind).toBe("symbol");
  });
  it("does not treat an unknown accent as a plain letter", () => {
    expect(spellUnits("ñ", "en").units[0]!.kind).toBe("symbol");
  });
  it("says a doubled letter twice", () => {
    expect(spellUnits("oo", "en").units).toHaveLength(2);
  });
  it("collapses runs of whitespace to one space and trims the ends", () => {
    expect(spellUnits("  a \n\t b  ", "en").units.map((u) => u.char)).toEqual(["a", " ", "b"]);
  });
  it("gives nothing for empty text", () => {
    expect(spellUnits("", "en")).toEqual({ units: [], cut: false });
    expect(spellUnits("   ", "fr")).toEqual({ units: [], cut: false });
    expect(spellLine("", "en")).toBe("");
  });
  it("cuts long text at the cap and says so", () => {
    const long = "a".repeat(MAX_SPELL_CHARS + 5);
    const r = spellUnits(long, "en");
    expect(r.units).toHaveLength(MAX_SPELL_CHARS);
    expect(r.cut).toBe(true);
    expect(spellUnits("a".repeat(MAX_SPELL_CHARS), "en").cut).toBe(false);
  });
  it("counts characters, not UTF-16 units, when cutting", () => {
    const r = spellUnits("😀".repeat(MAX_SPELL_CHARS + 1), "en");
    expect(r.units).toHaveLength(MAX_SPELL_CHARS);
    expect(r.units[0]!.char).toBe("😀");
  });
  it("joins the units with commas in spellLine", () => {
    expect(spellLine("ab", "en")).toBe("A as in Alfa, B as in Bravo");
  });
  it("is stable on a mixed place name", () => {
    const a = spellLine("Café Étoile 12", "fr");
    expect(a).toBe(spellLine("Café Étoile 12", "fr"));
    expect(a.split(", ")).toHaveLength(14);
  });
});

describe("worthSpelling", () => {
  it.each([
    ["Qu", false], ["Ave", false], ["Main", false], ["Quesnel", true], ["Wyandotte", true], ["Café", true], ["Rue", false], ["Saint-Laurent", true], ["Zeller", true],
    ["Bloor", false], ["Mississauga", true], ["O’Connor", true], ["12", false], ["Eglinton", false], ["Danforth", false], ["Hôtel", true],
  ])("%s is %s", (word, expected) => {
    expect(worthSpelling(word)).toBe(expected);
  });
});
