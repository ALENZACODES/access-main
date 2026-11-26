import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { ResultsProblem } from "./spotResults";
import * as copy from "./spotResultsCopy";
import type { ResultRow } from "./spotResults";
import { summariseResults } from "./spotSummary";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const LOCALES: readonly Locale[] = ["en", "fr"];
const PROBLEMS: readonly ResultsProblem[] = ["empty", "too-large", "not-csv", "wrong-header", "no-rows", "too-many-rows"];
const r = (id: string, tag: string, match?: "same" | "different" | "could-not-tell"): ResultRow => ({ n: id, id, name: id, tag, source: "S", retrievedOn: "2026-11-10", answers: match ? { match } : {}, dateLooked: null, notes: "", problems: [] });
const sums = [
  summariseResults([r("1", "yes", "same")]),
  summariseResults([r("1", "yes", "same"), r("2", "no", "different"), r("3", "yes", "could-not-tell"), r("4", "no")]),
  summariseResults([r("1", "yes", "different"), r("2", "yes", "different")]),
];

function everything(l: Locale): string[] {
  const out: string[] = [
    copy.resultsToggle(true, l), copy.resultsToggle(false, l), copy.resultsIntro(l), copy.resultsPasteLabel(l), copy.resultsRead(1, 0, l), copy.resultsRead(5, 0, l), copy.resultsRead(5, 1, l), copy.resultsRead(5, 2, l),
    copy.noAnswers(l), copy.tagTallyHeading(l), copy.tagTallyLine("yes", 1, 1, 0, l), copy.tagTallyLine("UNKNOWN", 4, 2, 1, l), copy.noRateNote(l), copy.problemsLine(1, l), copy.problemsLine(3, l),
    copy.cellProblemWord("answer-not-understood", "step", l), copy.cellProblemWord("date-not-understood", "date_looked", l), copy.reportButton(l), copy.reportSaveButton(l), copy.reportCopied(l),
    copy.reportCopyFailed(l), copy.differencesHeading(0, l), copy.differencesHeading(3, l), copy.noDifferences(l),
  ];
  for (const p of PROBLEMS) out.push(copy.resultsProblem(p, l));
  for (const k of ["same", "different", "could-not-tell", "not-answered"] as const) out.push(copy.matchWord(k, 1, l), copy.matchWord(k, 3, l));
  for (const s of sums) out.push(copy.spotSummaryLine(s, l));
  return out;
}

describe("the results copy", () => {
  it("passes the App's copy rules in both languages", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(lintCopy(s, l), s).toEqual([]);
  });
  it("has French with the right spacing and apostrophes", () => {
    for (const s of everything("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("never writes the French word for UNKNOWN", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(s, s).not.toMatch(/inconnu/i);
  });
  it("gives a different string in each language", () => {
    const en = everything("en");
    const fr = everything("fr");
    expect(en).toHaveLength(fr.length);
    for (let i = 0; i < en.length; i += 1) expect(en[i], en[i]).not.toBe(fr[i]);
  });
  it("never calls the pack wrong, an error or a place accessible", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(s, s).not.toMatch(/\b(wrong|incorrect|error|mistake|accessible|verified|correct)\b|erroné|erreur|vérifi/i);
  });
  it("says nothing is sent, saved or changed", () => {
    expect(copy.resultsIntro("en")).toContain("Nothing is sent or saved, and nothing in the pack is changed.");
    expect(copy.resultsIntro("fr")).toContain("Rien n’est envoyé ni enregistré, et rien n’est modifié dans le jeu de lieux.");
  });
  it("says the counts are not a rate and say nothing about places not looked at", () => {
    expect(copy.noRateNote("en")).toContain("not a rate");
    expect(copy.noRateNote("en")).toContain("nothing about the places you did not look at");
    expect(copy.noRateNote("fr")).toContain("Ce n’est pas un taux");
  });
  it("gives a different refusal for each problem", () => {
    for (const l of LOCALES) expect(new Set(PROBLEMS.map((p) => copy.resultsProblem(p, l))).size).toBe(PROBLEMS.length);
  });
  it("tells the person what words are accepted when a cell is not understood", () => {
    expect(copy.problemsLine(2, "en")).toContain("Yes, No, Not sure, Same, Different or Could not tell");
    expect(copy.problemsLine(2, "en")).toContain("YYYY-MM-DD");
    expect(copy.problemsLine(2, "fr")).toContain("AAAA-MM-JJ");
  });
  it("uses the singular and plural correctly", () => {
    expect(copy.resultsRead(1, 0, "en")).toBe("Read 1 place.");
    expect(copy.resultsRead(5, 0, "en")).toBe("Read 5 places.");
    expect(copy.resultsRead(5, 1, "en")).toBe("Read 5 places. 1 row with no place id was left out.");
    expect(copy.resultsRead(5, 2, "en")).toBe("Read 5 places. 2 rows with no place id were left out.");
    expect(copy.resultsRead(1, 0, "fr")).toBe("1 lieu lu.");
    expect(copy.resultsRead(5, 1, "fr")).toContain("1 ligne sans identifiant a été laissée de côté");
  });
  it("words the summary with counts and no rate", () => {
    expect(copy.spotSummaryLine(sums[1]!, "en")).toBe("Of 4 places on the sheet: 1 matched the tag, 1 differed from the tag, 1 could not be judged, 1 not answered.");
    expect(copy.spotSummaryLine(sums[0]!, "en")).toBe("Of 1 place on the sheet: 1 matched the tag.");
    expect(copy.spotSummaryLine(sums[2]!, "en")).not.toMatch(/%|percent|rate/i);
  });
  it("agrees French verbs with the count", () => {
    expect(copy.matchWord("same", 1, "fr")).toBe("correspond à l’étiquette");
    expect(copy.matchWord("same", 3, "fr")).toBe("correspondent à l’étiquette");
    expect(copy.matchWord("different", 1, "fr")).toBe("diffère de l’étiquette");
    expect(copy.matchWord("could-not-tell", 2, "fr")).toBe("n’ont pas pu être jugés");
  });
  it("has a file name for each language with no path or space", () => {
    for (const l of LOCALES) expect(copy.SPOT_REPORT_FILENAMES[l]).toMatch(/^[a-z0-9-]+\.txt$/);
  });
  it("makes a tag line with counts", () => {
    expect(copy.tagTallyLine("limited", 3, 2, 1, "en")).toBe("limited: 3 places, 2 matched, 1 differed");
  });
});
