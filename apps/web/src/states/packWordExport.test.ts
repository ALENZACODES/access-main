import { describe, expect, it } from "vitest";
import { OSM_CREDIT } from "./dataCredits";
import { buildWordIndex, wordList } from "./packWordIndex";
import { WORD_CSV_FILENAMES, WORD_CSV_HEADER, WORD_TEXT_FILENAMES, wordsToCsv, wordsToText } from "./packWordExport";
import { searchPlaces } from "./packSearchFixtures";

const entries = wordList(buildWordIndex(searchPlaces()), "any");

describe("wordsToCsv", () => {
  const rows = (s: string) => s.split("\r\n").filter((l) => l !== "");
  it("has the fixed header, then one row per word with its field and count", () => {
    const r = rows(wordsToCsv(entries, "any"));
    expect(r[0]).toBe(WORD_CSV_HEADER.join(","));
    expect(r).toHaveLength(entries.length + 1);
    expect(r[1]).toBe(`street,any,${entries[0]!.places}`);
  });
  it("names the field the words came from", () => {
    const notes = wordList(buildWordIndex(searchPlaces()), "note");
    for (const line of rows(wordsToCsv(notes, "note")).slice(1)) expect(line).toMatch(/^[^,]+,note,\d+$/);
  });
  it("starts with a byte order mark only when asked, and ends with a line break", () => {
    expect(wordsToCsv(entries, "any").charCodeAt(0)).not.toBe(0xfeff);
    expect(wordsToCsv(entries, "any", { bom: true }).charCodeAt(0)).toBe(0xfeff);
    expect(wordsToCsv(entries, "any").endsWith("\r\n")).toBe(true);
  });
  it("writes only the header for no words", () => {
    expect(wordsToCsv([], "any")).toBe("word,field,places\r\n");
  });
  it("keeps a cell that could be read as a formula from running as one", () => {
    expect(wordsToCsv([{ word: "=cmd", places: 1 }], "any")).toContain("'=cmd,any,1");
  });
  it("has the same header in both languages and a French file name", () => {
    expect(WORD_CSV_FILENAMES.en).not.toBe(WORD_CSV_FILENAMES.fr);
    expect(WORD_TEXT_FILENAMES.en).not.toBe(WORD_TEXT_FILENAMES.fr);
    for (const f of [...Object.values(WORD_CSV_FILENAMES), ...Object.values(WORD_TEXT_FILENAMES)]) expect(f).toMatch(/^[a-z-]+\.(csv|txt)$/);
  });
});

describe("wordsToText", () => {
  it("has a heading, the part of the places, every word with its count, and the OpenStreetMap credit once", () => {
    const text = wordsToText(entries, "any", "en");
    expect(text.startsWith("Words in this pack\r\n")).toBe(true);
    expect(text).toContain("Part of the places: Name, address or kind");
    expect(text).toContain(`street: ${entries[0]!.places}\r\n`);
    expect(text.split(OSM_CREDIT).length - 1).toBe(1);
    expect(text.trimEnd().endsWith(OSM_CREDIT)).toBe(true);
  });
  it("is French with a no-break space before the colon", () => {
    const text = wordsToText(entries, "any", "fr");
    expect(text).toContain("Mots du pack");
    expect(text).toContain(`street\u00a0: ${entries[0]!.places}`);
    expect(text).toContain("Partie des lieux\u00a0: Nom, adresse ou genre");
    expect(text).not.toMatch(/INCONN/i);
  });
  it("lists the words in the order given", () => {
    const lines = wordsToText(entries, "any", "en").split("\r\n").filter((l) => /^[a-z0-9]+: \d+$/.test(l));
    expect(lines.map((l) => l.split(":")[0])).toEqual(entries.map((e) => e.word));
  });
});
