import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, analyze, checkPlain, countSyllables, splitSentences } from "./plainLanguage";

describe("splitSentences", () => {
  it("splits on . ! ? and keeps decimals together", () => {
    expect(splitSentences("It is 1.5 kB. Is it small? Yes!")).toEqual(["It is 1.5 kB.", "Is it small?", "Yes!"]);
  });
  it("splits after a French non-breaking space before ?", () => {
    expect(splitSentences("Effacer\u202f? Oui.")).toEqual(["Effacer\u202f?", "Oui."]);
  });
  it("returns nothing for empty text", () => {
    expect(splitSentences("  ")).toEqual([]);
  });
});

describe("countSyllables", () => {
  it.each([
    ["en", "data", 2],
    ["en", "erase", 2],
    ["en", "device", 2],
    ["en", "the", 1],
    ["en", "browser", 2],
    ["en", "stored", 1],
    ["en", "needed", 2],
    ["en", "table", 2],
    ["fr", "données", 2],
    ["fr", "appareil", 3],
    ["fr", "effacer", 3],
    ["fr", "App", 1],
  ] as const)("%s %s has %i", (loc, w, n) => {
    expect(countSyllables(loc, w)).toBe(n);
  });
  it("counts at least one for any word, and zero for nothing", () => {
    expect(countSyllables("en", "hmm")).toBe(1);
    expect(countSyllables("en", "")).toBe(0);
  });
});

describe("analyze", () => {
  it("measures words, sentences and the longest sentence", () => {
    const r = analyze("en", "Erase your data. This removes what the App stored in this browser.");
    expect(r.words).toBe(12);
    expect(r.sentences).toBe(2);
    expect(r.longestSentence).toBe(9);
  });
  it("scores short plain English easy, and dense text hard", () => {
    expect(analyze("en", "Erase the data on this device. It takes one tap.").gradeEn).toBeLessThan(5);
    expect(analyze("en", "Notwithstanding aforementioned considerations, administrative determinations necessitate comprehensive documentation.").gradeEn).toBeGreaterThan(14);
  });
  it("scores short plain French easy, and dense text hard", () => {
    expect(analyze("fr", "Effacez les données de cet appareil. Cela prend un clic.").kandelMoles).toBeGreaterThan(70);
    expect(analyze("fr", "Nonobstant les considérations susmentionnées, les déterminations administratives nécessitent une documentation exhaustive.").kandelMoles).toBeLessThan(30);
  });
  it("counts apostrophe words as one word", () => {
    expect(analyze("fr", "L’App n’a rien.").words).toBe(3);
  });
});

describe("checkPlain", () => {
  const long = Array.from({ length: 30 }, () => "word").join(" ");
  it("flags a sentence over the limit", () => {
    expect(checkPlain("en", `${long}.`).map((p) => p.code)).toContain("sentence-too-long");
  });
  it("flags a grade above the limit in English only", () => {
    const hard = "Administrative determinations necessitate comprehensive documentation regarding organizational responsibilities.";
    expect(checkPlain("en", hard).map((p) => p.code)).toContain("grade-too-high");
  });
  it("flags a low Kandel-Moles score in French only", () => {
    const hard = "Les déterminations administratives nécessitent une documentation exhaustive concernant les responsabilités organisationnelles.";
    expect(checkPlain("fr", hard).map((p) => p.code)).toContain("hard-to-read");
    expect(checkPlain("fr", hard).map((p) => p.code)).not.toContain("grade-too-high");
  });
  it.each([
    ["en", "We utilize telemetry."],
    ["en", "A sandbox."],
    ["fr", "La télémétrie est utilisée."],
    ["fr", "Aux fins de la présente."],
  ] as const)("flags jargon even in a short label: %s %s", (loc, text) => {
    expect(checkPlain(loc, text).map((p) => p.code)).toContain("jargon");
  });
  it("scores only prose, not short labels", () => {
    expect(checkPlain("en", "Administrative determinations")).toEqual([]);
  });
  it("passes ordinary plain text", () => {
    expect(checkPlain("en", "This covers only what the App stored in this browser. It does not cover data held on a server.")).toEqual([]);
    expect(checkPlain("fr", "Cela supprime ce que l’App a enregistré dans ce navigateur. Rien n’est envoyé ailleurs.")).toEqual([]);
  });
  it("uses the limits it is given", () => {
    expect(checkPlain("en", `${long}.`, { ...DEFAULT_LIMITS, maxSentenceWords: 40 }).map((p) => p.code)).not.toContain("sentence-too-long");
  });
});
