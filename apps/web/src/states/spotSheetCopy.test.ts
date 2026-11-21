import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { WheelchairTag } from "./packPlaces";
import * as copy from "./spotSheetCopy";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const LOCALES: readonly Locale[] = ["en", "fr"];
const TAGS: readonly WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];
const zero = { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };

function everything(l: Locale): string[] {
  const out: string[] = [
    copy.sheetTitle(1, l), copy.sheetTitle(5, l), copy.sheetIntro("2026-11-21", true, l), copy.sheetIntro("my seed", false, l), ...copy.sheetFooter(l),
    ...Object.values(copy.labels).map((f) => f(l)), copy.sourceLine("OpenStreetMap", "10 November 2026", l), copy.seedLabel(l), copy.noPlaces(l),
    copy.spotSampleLine(5, 5, 40, l), copy.spotSampleLine(1, 5, 1, l), copy.spotSampleLine(3, 5, 3, l), copy.spotSampleLine(0, 5, 0, l), copy.spotSampleLine(1, 1, 9, l),
    copy.tallyLine({ ...zero, yes: 2, limited: 1 }, l), copy.tallyLine({ ...zero, unknown: 3 }, l),
  ];
  for (const k of copy.CHECK_KEYS) out.push(copy.checkQuestion(k, l));
  for (const k of ["yes", "no", "not-sure", "same", "different", "could-not-tell"] as const) out.push(copy.answerWord(k, l));
  for (const tag of TAGS) out.push(copy.tagWord(tag, l));
  return out.filter((s) => s !== "");
}

describe("the spot-check copy", () => {
  it("passes the App's copy rules in both languages", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(lintCopy(s, l), s).toEqual([]);
  });
  it("has French with the right spacing and apostrophes", () => {
    for (const s of everything("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("never writes the French word for UNKNOWN", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(s, s).not.toMatch(/inconnu/i);
  });
  it("keeps UNKNOWN as UNKNOWN in both languages", () => {
    for (const l of LOCALES) expect(copy.tagWord("unknown", l)).toBe("UNKNOWN");
  });
  it("never says a place is accessible, safe, correct, wrong or confirmed", () => {
    for (const l of LOCALES) {
      for (const s of everything(l)) {
        expect(s, s).not.toMatch(/\b(accessible|safe|correct|incorrect|wrong|confirmed|certified|guaranteed)\b/i);
        expect(s, s).not.toMatch(/accessible|sûr|erroné|confirmé|garanti/i);
      }
    }
  });
  it("says the tag is what the pack reports, and that it is not a finding", () => {
    expect(copy.sheetFooter("en")[0]).toContain("is a report with a source and a date. It is not a finding");
    expect(copy.sheetFooter("fr")[0]).toContain("Ce n’est pas un constat");
    expect(copy.sheetIntro("s", true, "en")).toContain("what the saved pack reports, with its source");
  });
  it("says nothing is sent or saved by the App", () => {
    expect(copy.sheetIntro("s", true, "en")).toContain("nothing here is sent or saved by the App");
    expect(copy.sheetIntro("s", true, "fr")).toContain("rien ici n’est envoyé ni enregistré par l’application");
  });
  it("names the seed and how the places were chosen", () => {
    expect(copy.sheetIntro("abc", true, "en")).toContain("seed “abc”");
    expect(copy.sheetIntro("abc", true, "en")).toContain("taken in turn from each wheelchair tag");
    expect(copy.sheetIntro("abc", false, "en")).toContain("drawn at random");
    expect(copy.sheetIntro("abc", false, "fr")).toContain("tirées au hasard");
  });
  it("gives a different sentence in each language for every string", () => {
    const en = everything("en");
    const fr = everything("fr");
    expect(en).toHaveLength(fr.length);
    for (let i = 0; i < en.length; i += 1) if (en[i] !== "UNKNOWN") expect(en[i], en[i]).not.toBe(fr[i]);
  });
  it("has answers for every question, three each, with distinct words", () => {
    for (const k of copy.CHECK_KEYS) {
      const answers = copy.CHECK_ANSWERS[k];
      expect(answers).toHaveLength(3);
      for (const l of LOCALES) expect(new Set(answers.map((a) => copy.answerWord(a, l))).size).toBe(3);
    }
  });
  it("asks a different question for every key", () => {
    for (const l of LOCALES) expect(new Set(copy.CHECK_KEYS.map((k) => copy.checkQuestion(k, l))).size).toBe(copy.CHECK_KEYS.length);
  });
  it("words every question as a question", () => {
    for (const l of LOCALES) for (const k of copy.CHECK_KEYS) expect(copy.checkQuestion(k, l)).toMatch(/\?$|\u00a0\?$/);
  });
  it("has a file name for each format and language, with no path or space", () => {
    for (const l of LOCALES) for (const name of Object.values(copy.SPOT_FILENAMES[l])) expect(name).toMatch(/^[a-z0-9-]+\.(html|txt|csv)$/);
  });
  it("uses the singular for one place", () => {
    expect(copy.sheetTitle(1, "en")).toBe("Spot-check sheet: 1 place");
    expect(copy.sheetTitle(5, "en")).toBe("Spot-check sheet: 5 places");
    expect(copy.sheetTitle(1, "fr")).toContain("1 lieu");
    expect(copy.sheetTitle(5, "fr")).toContain("5 lieux");
  });
  it("says what happened when fewer places than wanted were available", () => {
    expect(copy.spotSampleLine(5, 5, 40, "en")).toBe("5 places chosen from 40.");
    expect(copy.spotSampleLine(3, 5, 3, "en")).toBe("Only 3 places to choose from, so all of them are on the sheet.");
    expect(copy.spotSampleLine(1, 5, 1, "en")).toBe("Only 1 place to choose from, so that one is on the sheet.");
    expect(copy.spotSampleLine(0, 5, 0, "en")).toBe("There are no places to choose from.");
  });
  it("makes a tally in tag order, leaving out tags with none, and nothing when empty", () => {
    expect(copy.tallyLine({ ...zero, no: 1, yes: 2 }, "en")).toBe("By the tag the pack reports: Yes: 2; No: 1.");
    expect(copy.tallyLine(zero, "en")).toBe("");
    expect(copy.tallyLine(zero, "fr")).toBe("");
  });
});
