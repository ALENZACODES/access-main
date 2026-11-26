import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import * as c from "./nameLanguageCopy";
import { NAME_READINGS, readNameLanguage, type NameLanguage } from "./nameLanguage";
import { NAME_FILTERS, NAME_ORDERS } from "./nameLanguageReport";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const counts = { french: 1, english: 2, both: 3, neither: 4, "other-script": 0, "no-name": 0 };
const langs: NameLanguage[] = ["Bibliothèque municipale", "Public Library", "Bibliothèque / Library", "Tim Hortons", "Café Zoé", "北京", "L'Église", "Rue des Érables Public"].map((n) => readNameLanguage(n));

function lines(l: Locale): string[] {
  return [
    c.nlHeading(l), c.nlToggle(true, l), c.nlToggle(false, l), c.nlIntro(l), c.nlCoverage(1, 0, l), c.nlCoverage(5, 0, l), c.nlCoverage(1, 1, l), c.nlCoverage(5, 2, l),
    c.nlFilterGroup(l), c.nlOrderGroup(l), c.nlSummary({ named: 0, byReading: counts }, l), c.nlSummary({ named: 1, byReading: { ...counts, french: 1 } }, l), c.nlSummary({ named: 10, byReading: counts }, l),
    c.nlAccentLine(0, l), c.nlAccentLine(1, l), c.nlAccentLine(3, l), c.nlPairLine(0, l), c.nlPairLine(1, l), c.nlPairLine(2, l), c.nlNoName(l), c.nlNoMatch(l),
    c.nlMoreLine(1, l), c.nlMoreLine(4, l), c.nlCaveat(l), c.nlSaveText(l), c.nlSaveCsv(l), c.nlSavedLine("x.csv", l), c.nlCannotSave(l),
    ...NAME_READINGS.map((r) => c.nlReadingLabel(r, l)), ...NAME_READINGS.map((r) => c.nlTallyLine(r, 3, 25, l)), c.nlTallyLine("french", 0, null, l),
    ...NAME_FILTERS.map((f) => c.nlFilterLabel(f, l)), ...NAME_ORDERS.map((o) => c.nlOrderLabel(o, l)), ...langs.map((x) => c.nlRowLine(x, l)),
  ].filter((x) => x !== "");
}

describe("name language copy", () => {
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("labels every reading, filter and order differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(NAME_READINGS.map((r) => c.nlReadingLabel(r, l))).size).toBe(NAME_READINGS.length);
      expect(new Set(NAME_FILTERS.map((f) => c.nlFilterLabel(f, l))).size).toBe(NAME_FILTERS.length);
      expect(new Set(NAME_ORDERS.map((o) => c.nlOrderLabel(o, l))).size).toBe(NAME_ORDERS.length);
    }
  });
  it("never says what language a name is in", () => {
    for (const l of ["en", "fr"] as const) for (const line of lines(l)) expect(line.toLowerCase(), line).not.toMatch(/\bis (in )?(french|english)\b|est en (français|anglais)|\b(wrong|incorrect|verified)\b|vérifi/);
  });
  it("says it is a guess", () => {
    expect(c.nlIntro("en")).toMatch(/guess/);
    expect(c.nlCaveat("en")).toMatch(/A guess from common words/);
    expect(c.nlCaveat("fr")).toMatch(/Une supposition/);
  });
  it("agrees in number", () => {
    expect(c.nlCoverage(1, 0, "en")).toBe("1 place has a name to read.");
    expect(c.nlCoverage(3, 0, "en")).toBe("3 places have a name to read.");
    expect(c.nlCoverage(1, 1, "en")).toBe("1 place has a name to read; 1 has none.");
    expect(c.nlCoverage(3, 2, "en")).toBe("3 places have a name to read; 2 have none.");
    expect(c.nlCoverage(2, 2, "fr")).toBe("2 lieux ont un nom à lire\u202f; 2 n’en ont aucun.");
    expect(c.nlCoverage(1, 1, "fr")).toBe("1 lieu a un nom à lire\u202f; 1 n’en a aucun.");
    expect(c.nlAccentLine(1, "en")).toBe("1 name has a French accent but no word that points to a language.");
    expect(c.nlAccentLine(2, "en")).toBe("2 names have a French accent but no word that points to a language.");
    expect(c.nlAccentLine(0, "en")).toBe("");
    expect(c.nlPairLine(1, "en")).toContain("1 name gives");
    expect(c.nlPairLine(2, "en")).toContain("2 names give");
    expect(c.nlMoreLine(1, "en")).toBe("1 more place is in the saved files.");
    expect(c.nlMoreLine(2, "fr")).toBe("2 autres lieux figurent dans les fichiers enregistrés.");
  });
  it("summarises the counts", () => {
    expect(c.nlSummary({ named: 6, byReading: counts }, "en")).toBe("1 name has words that point to French, 2 to English and 3 to both.");
    expect(c.nlSummary({ named: 0, byReading: counts }, "en")).toBe("No place has a name to read.");
    expect(c.nlSummary({ named: 6, byReading: { ...counts, french: 2 } }, "en")).toBe("2 names have words that point to French, 2 to English and 3 to both.");
  });
  it("writes a tally line with the share when there is one", () => {
    expect(c.nlTallyLine("french", 3, 25, "en")).toBe("Words that point to French: 3 (25%)");
    expect(c.nlTallyLine("french", 3, null, "en")).toBe("Words that point to French: 3");
    expect(c.nlTallyLine("french", 3, 25, "fr")).toBe("Mots qui évoquent le français\u00a0: 3 (25\u00a0%)");
  });
  it("quotes the words it found, with French quotation marks in French", () => {
    expect(c.nlRowLine(readNameLanguage("Bibliothèque municipale"), "en")).toBe("French: \u201cbibliotheque\u201d, \u201cmunicipale\u201d.");
    expect(c.nlRowLine(readNameLanguage("Bibliothèque municipale"), "fr")).toBe("Français\u00a0: «\u202fbibliotheque\u202f», «\u202fmunicipale\u202f».");
  });
  it("names both kinds of word, and says a pair is a pair", () => {
    expect(c.nlRowLine(readNameLanguage("Bibliothèque / Library"), "en")).toBe("French: \u201cbibliotheque\u201d; a pair: English: \u201clibrary\u201d.");
    expect(c.nlRowLine(readNameLanguage("Public Library Bibliothèque"), "en")).toBe("French: \u201cbibliotheque\u201d; English: \u201cpublic\u201d, \u201clibrary\u201d.");
  });
  it("describes a name with no words by its reading", () => {
    expect(c.nlRowLine(readNameLanguage("Tim Hortons"), "en")).toBe("No words that point to a language.");
    expect(c.nlRowLine(readNameLanguage("北京"), "en")).toBe("Written in another alphabet.");
  });
  it("has file names in both languages and a header with ten columns", () => {
    expect(c.NL_CSV_NAME.en).not.toBe(c.NL_CSV_NAME.fr);
    expect(c.NL_TEXT_NAME.fr).toMatch(/\.txt$/);
    expect(c.NL_CSV_NAME.en).toMatch(/\.csv$/);
    expect(c.NL_CSV_HEADER).toHaveLength(10);
  });
  it("labels the toggle by state", () => {
    expect(c.nlToggle(false, "en")).toBe("Look at the language of the names");
    expect(c.nlToggle(true, "en")).toBe("Hide the language of the names");
    expect(c.nlToggle(false, "fr")).not.toBe(c.nlToggle(true, "fr"));
  });
});
