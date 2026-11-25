import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import * as c from "./noteReadabilityCopy";
import { READING_BANDS } from "./noteReadability";
import { READING_FILTERS, READING_ORDERS } from "./noteReadabilityIndex";
import { lintFrench } from "./typography";
import type { Locale } from "./stateCopy";

const LOCALES: Locale[] = ["en", "fr"];

function lines(l: Locale): string[] {
  const col = c.readColumns(l);
  return [
    c.readHeading(l), c.readToggle(true, l), c.readToggle(false, l), c.readIntro(l), c.filterGroupLabel(l), c.orderGroupLabel(l), c.readNoName(l), c.readNoNotes(l), c.readNoMatch(l),
    c.readCoverageLine(3, 5, l), c.readCoverageLine(1, 1, l), c.readCoverageLine(0, 2, l), c.readTooShortLine(1, l), c.readTooShortLine(4, l), c.readWithoutLine(1, l), c.readWithoutLine(3, l),
    c.readOtherLanguageLine(1, l), c.readOtherLanguageLine(2, l), c.readAverageLine(62, l), c.readTableCaption(l), ...Object.values(col), c.readLongWordsLine(["accessibility"], l),
    c.readLongSentencesLine(1, l), c.readLongSentencesLine(2, l), c.readShownLine(1, 5, l), c.readShownLine(3, 3, l), c.readSaveText(l), c.readSaveCsv(l), c.readSavedLine("x.csv", l), c.readCannotSave(l), c.readTextCaveat(l),
    ...READING_BANDS.map((b) => c.readingBandLabel(b, l)), ...READING_FILTERS.map((f) => c.readingFilterLabel(f, l)), ...READING_ORDERS.map((o) => c.readingOrderLabel(o, l)),
  ];
}

describe("reading copy", () => {
  for (const l of LOCALES) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("has no empty line where text is expected", () => {
    for (const l of LOCALES) for (const line of lines(l)) if (!/^$/.test(line)) expect(line.trim()).not.toBe("");
  });
  it("gives every band, filter and order a label that differs from the others", () => {
    for (const l of LOCALES) {
      expect(new Set(READING_BANDS.map((b) => c.readingBandLabel(b, l))).size).toBe(4);
      expect(new Set(READING_FILTERS.map((f) => c.readingFilterLabel(f, l))).size).toBe(READING_FILTERS.length);
      expect(new Set(READING_ORDERS.map((o) => c.readingOrderLabel(o, l))).size).toBe(READING_ORDERS.length);
    }
  });
  it("says nothing for a zero count", () => {
    for (const l of LOCALES) {
      expect(c.readTooShortLine(0, l)).toBe("");
      expect(c.readWithoutLine(0, l)).toBe("");
      expect(c.readOtherLanguageLine(0, l)).toBe("");
      expect(c.readAverageLine(null, l)).toBe("");
      expect(c.readLongWordsLine([], l)).toBe("");
      expect(c.readLongSentencesLine(0, l)).toBe("");
    }
  });
  it("makes singular and plural agree", () => {
    expect(c.readCoverageLine(1, 1, "en")).toBe("1 of 1 note could be scored.");
    expect(c.readCoverageLine(2, 3, "en")).toBe("2 of 3 notes could be scored.");
    expect(c.readTooShortLine(1, "en")).toBe("1 note is too short to score.");
    expect(c.readTooShortLine(2, "en")).toBe("2 notes are too short to score.");
    expect(c.readWithoutLine(1, "en")).toBe("1 place has no note.");
    expect(c.readWithoutLine(2, "fr")).toContain("n’ont pas");
    expect(c.readWithoutLine(1, "fr")).toContain("n’a pas");
  });
  it("names no claim of being right, verified or live", () => {
    for (const l of LOCALES) expect(c.readIntro(l)).not.toMatch(/verif|vérif|accessible|real-?time|temps réel/i);
  });
  it("has a CSV header of fixed English column names", () => {
    expect(c.READ_CSV_HEADER).toEqual(["place_id", "place_name", "note_language", "score", "reads_as", "words", "sentences", "words_per_sentence", "long_words", "long_sentences"]);
  });
});
