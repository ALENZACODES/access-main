import { describe, expect, it } from "vitest";
import {
  missingWordLine, missingWordsHeading, nearWordLine, nearWordNoneLine, searchForWordLabel, wordButtonLabel, wordCountLine, wordFieldLabel, wordsFieldGroupLabel, wordsHeading, wordsIntro,
  wordsSaveCsvLabel, wordsSaveTextLabel, wordsShowAllLabel, wordsShowFewerLabel, wordsToggle,
} from "./packWordCopy";
import { WORD_FIELDS } from "./packWordIndex";
import type { Locale } from "./stateCopy";

const LOCALES: Locale[] = ["en", "fr"];
/** Every piece of copy the module makes, in both languages. */
function everything(locale: Locale): string[] {
  const out = [wordsHeading(locale), wordsToggle(true, locale), wordsToggle(false, locale), wordsIntro(locale), wordsFieldGroupLabel(locale), missingWordsHeading(locale), nearWordNoneLine(locale), wordsShowFewerLabel(locale), wordsSaveTextLabel(locale), wordsSaveCsvLabel(locale), wordsShowAllLabel(31, locale), searchForWordLabel("cafe", locale), wordCountLine(0, 0, locale), wordCountLine(5, 5, locale), wordCountLine(30, 90, locale)];
  for (const f of WORD_FIELDS) out.push(wordFieldLabel(f, locale), missingWordLine("zzzz", f, locale));
  for (const r of ["spelling", "french-kind"] as const) out.push(nearWordLine("cafe", 1, r, locale), nearWordLine("cafe", 3, r, locale));
  return out;
}

describe("the word help copy", () => {
  it("has English and French for every line, and no line is empty or the same in both except Notes", () => {
    const en = everything("en");
    const fr = everything("fr");
    expect(en).toHaveLength(fr.length);
    en.forEach((line, i) => {
      expect(line.trim(), line).not.toBe("");
      expect(fr[i]!.trim(), fr[i]).not.toBe("");
    });
    const same = en.filter((line, i) => line === fr[i] && line !== "Notes" && /[a-z]{4,}/i.test(line.replace(/zzzz|cafe/g, "")));
    expect(same).toEqual([]);
  });
  it("uses the French typography: typographic apostrophes, a no-break space before a colon, thin spaces before ; ! ? and inside « »", () => {
    for (const line of everything("fr")) {
      expect(line, line).not.toMatch(/\w'\w/);
      expect(line, line).not.toMatch(/\S [:;!?](?!\w)/);
      expect(line, line).not.toMatch(/\S[;!?](?=\s|$)/);
      expect(line, line).not.toMatch(/«(?!\u202f)|(?<!\u202f)»/);
    }
  });
  it("never uses the French word for UNKNOWN or the words the App does not claim", () => {
    const claims = new RegExp(["inconn", "real[- ]time", ["partner", "ship"].join(""), "guarantee", ["veri", "fied"].join(""), ["veri", "fy"].join(""), ["vé", "rifi"].join(""), "did you mean", "correct", "best", "recommend", "suitable"].join("|"), "i");
    for (const l of LOCALES) for (const line of everything(l)) expect(line, line).not.toMatch(claims);
  });
  it("counts places in French the French way", () => {
    expect(nearWordLine("pharmacy", 0, "spelling", "fr")).toContain("0 lieu");
    expect(nearWordLine("pharmacy", 1, "spelling", "fr")).toContain("1 lieu)");
    expect(nearWordLine("pharmacy", 2, "spelling", "fr")).toContain("2 lieux");
    expect(nearWordLine("pharmacy", 1, "spelling", "en")).toContain("1 place)");
    expect(nearWordLine("pharmacy", 2, "spelling", "en")).toContain("2 places");
  });
  it("puts a word from the search or the pack in raw: nothing about it is changed by French typography", () => {
    const odd = "l'x:y;z!w?v";
    for (const l of LOCALES) {
      expect(missingWordLine(odd, "any", l)).toContain(l === "fr" ? `«\u202f${odd}\u202f»` : `“${odd}”`);
      expect(nearWordLine(odd, 1, "spelling", l)).toContain(l === "fr" ? `«\u202f${odd}\u202f»` : `“${odd}”`);
      expect(searchForWordLabel(odd, l)).toContain(l === "fr" ? `«\u202f${odd}\u202f»` : `“${odd}”`);
    }
    expect(wordButtonLabel(odd, 3)).toBe(`${odd} (3)`);
  });
  it("says in words where the word was looked for", () => {
    expect(missingWordLine("x", "kind", "en")).toBe("No place has the word “x” as a kind.");
    expect(missingWordLine("x", "note", "en")).toBe("No place has the word “x” in a note.");
    expect(missingWordLine("x", "any", "fr")).toBe("Aucun lieu n’a le mot «\u202fx\u202f» dans son nom, son adresse ou son genre.");
  });
  it("tells the two reasons apart", () => {
    expect(nearWordLine("pharmacy", 1, "french-kind", "en")).toBe("The pack names this kind “pharmacy” (1 place)");
    expect(nearWordLine("cafe", 2, "spelling", "en")).toBe("Close in spelling: “cafe” (2 places)");
    expect(nearWordLine("cafe", 2, "spelling", "fr")).toBe("Proche par l’orthographe\u00a0: «\u202fcafe\u202f» (2 lieux)");
  });
  it("describes how many words are shown", () => {
    expect(wordCountLine(5, 5, "en")).toBe("5 words, all shown.");
    expect(wordCountLine(30, 90, "en")).toContain("30 of 90 words shown");
    expect(wordCountLine(0, 0, "en")).toContain("no words");
    expect(wordsShowAllLabel(90, "en")).toBe("Show all 90 words");
  });
});
