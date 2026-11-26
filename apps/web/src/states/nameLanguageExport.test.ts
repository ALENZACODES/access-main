import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { NL_CSV_HEADER, NL_CSV_NAME, NL_TEXT_NAME } from "./nameLanguageCopy";
import { namesCsvFile, namesTextFile, namesToCsv, namesToText } from "./nameLanguageExport";
import { buildNameReport } from "./nameLanguageReport";
import { place } from "./placeFixtures";

const p = (id: string, name: string | null, category: string | null = "library") => place(id, { name, category });
const rows = () => buildNameReport([p("a", "Bibliothèque municipale"), p("b", "Public Library"), p("c", "=Tim Hortons", "cafe"), p("d", "Bibliothèque / Library"), p("e", null)]).rows;

describe("namesToCsv", () => {
  it("writes the header and a row per place", () => {
    const parsed = parseCsv(namesToCsv(rows()));
    expect(parsed.ok && parsed.rows[0]).toEqual([...NL_CSV_HEADER]);
    expect(parsed.ok && parsed.rows).toHaveLength(6);
  });
  it("writes the reading, the words, the accents and the pair", () => {
    const parsed = parseCsv(namesToCsv(rows()));
    const r = parsed.ok ? parsed.rows : [];
    expect(r[1]).toEqual(["a", "Bibliothèque municipale", "library", "french", "bibliotheque municipale", "", "1", "no", "english", "differs"]);
    expect(r[2]).toEqual(["b", "Public Library", "library", "english", "", "public library", "0", "no", "english", "same"]);
    expect(r[4]).toEqual(["d", "Bibliothèque / Library", "library", "both", "bibliotheque", "library", "1", "yes", "english", "same"]);
  });
  it("writes a place with no name with an empty name", () => {
    const parsed = parseCsv(namesToCsv(rows()));
    expect(parsed.ok && parsed.rows[5]!.slice(0, 4)).toEqual(["e", "", "library", "no-name"]);
  });
  it("guards a name that starts like a formula", () => expect(namesToCsv(rows())).toContain("'=Tim Hortons"));
  it("starts with a byte order mark only when asked", () => {
    expect(namesToCsv([]).charCodeAt(0)).not.toBe(0xfeff);
    expect(namesToCsv([], { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });
  it("writes only the header for no rows, with CRLF line ends", () => expect(namesToCsv([])).toBe(NL_CSV_HEADER.join(",") + "\r\n"));
  it("writes every row it is given", () => expect(namesToCsv(rows().slice(0, 2)).split("\r\n").filter(Boolean)).toHaveLength(3));
});

describe("namesToText", () => {
  it("starts with the caveat and has a block per place", () => {
    const t = namesToText(rows(), "en");
    expect(t.startsWith("A guess from common words")).toBe(true);
    expect(t).toContain("Bibliothèque municipale (a)");
    expect(t).toContain("  Words that point to French");
    expect(t).toContain("  French: \u201cbibliotheque\u201d, \u201cmunicipale\u201d.");
  });
  it("leaves out the word line for a name with no words", () => {
    const t = namesToText(buildNameReport([p("c", "Tim Hortons")]).rows, "en");
    expect(t).toContain("  No words that point to a language");
    expect(t).not.toMatch(/\n {2}No words that point to a language\.\n/);
  });
  it("says when the name is missing", () => expect(namesToText(buildNameReport([p("e", null)]).rows, "en")).toContain("Name not in the pack (e)"));
  it("is in French for French", () => {
    const t = namesToText(rows(), "fr");
    expect(t).toContain("Mots qui évoquent le français");
    expect(t).toContain("Une supposition");
  });
  it("keeps the names as given", () => expect(namesToText(rows(), "en")).toContain("=Tim Hortons (c)"));
});

describe("files", () => {
  it("name the files for the language and set the type", () => {
    expect(namesCsvFile(rows(), "fr")).toMatchObject({ name: NL_CSV_NAME.fr, mime: "text/csv;charset=utf-8" });
    expect(namesTextFile(rows(), "en")).toMatchObject({ name: NL_TEXT_NAME.en, mime: "text/plain;charset=utf-8" });
    expect(namesCsvFile(rows(), "en").content.charCodeAt(0)).toBe(0xfeff);
  });
});
