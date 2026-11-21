import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import * as copy from "./packFingerprintCopy";
import type { CodeProblem } from "./packFingerprintCode";
import { BUCKET_KEYS } from "./packFingerprint";
import { comparePrints, type CompareKind, type Comparison } from "./packFingerprintCompare";
import { fingerprintPlaces } from "./packFingerprint";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";
import { place, varied } from "./placeFixtures";

const LOCALES: readonly Locale[] = ["en", "fr"];
const PROBLEMS: readonly CodeProblem[] = ["empty", "too-long", "not-a-code", "unsupported-version", "malformed", "incomplete", "typo"];
const KINDS: readonly CompareKind[] = ["both-empty", "same", "same-ids-different-details", "different-places"];

const base = varied(41, 30);
const comparisons: Comparison[] = [
  comparePrints(fingerprintPlaces([]), fingerprintPlaces([])),
  comparePrints(fingerprintPlaces(base), fingerprintPlaces(base)),
  comparePrints(fingerprintPlaces(base), fingerprintPlaces(base.map((p, i) => (i === 0 ? place(p.id, { name: "edit" }) : p)))),
  comparePrints(fingerprintPlaces(base), fingerprintPlaces(base.slice(5))),
  comparePrints(fingerprintPlaces([]), fingerprintPlaces(base)),
];

function everything(locale: Locale): string[] {
  const out: string[] = [
    copy.fingerprintToggle(true, locale), copy.fingerprintToggle(false, locale), copy.fingerprintIntro(locale), copy.fingerprintNoPlaces(locale),
    copy.fingerprintCountLine(1, locale), copy.fingerprintCountLine(2, locale), copy.fingerprintCountLine(40, locale), copy.fingerprintCodeLabel(locale), copy.fingerprintCopyButton(locale), copy.fingerprintButtonsLabel(locale),
    copy.fingerprintSaveButton(locale), copy.fingerprintCopied(locale), copy.fingerprintCopyFailed(locale), copy.fingerprintSaved("file.txt", locale), copy.fingerprintSaveFailed(locale),
    copy.fingerprintPasteLabel(locale), copy.groupsExplain(locale), copy.fingerprintLimit(locale), copy.hereListHeading(5, 5, locale), copy.hereListHeading(50, 30, locale),
    copy.comparisonSaveButton(locale), copy.groupTableCaption(locale), copy.groupColumn(locale), copy.hereColumn(locale), copy.thereColumn(locale), copy.stateColumn(locale),
    copy.stateWord(true, locale), copy.stateWord(false, locale),
  ];
  for (const p of PROBLEMS) out.push(copy.fingerprintProblem(p, undefined, locale), copy.fingerprintProblem(p, "tok", locale));
  for (const k of KINDS) out.push(copy.comparisonHeadline(k, locale));
  for (const c of comparisons) {
    out.push(copy.comparisonCounts(c, locale));
    const g = copy.comparisonGroups(c, locale);
    if (g !== "") out.push(g);
    for (const b of c.buckets) out.push(copy.groupRowLabel(b, locale));
  }
  return out;
}

describe("the fingerprint copy", () => {
  it("passes the App's copy rules in both languages", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(lintCopy(s, l), s).toEqual([]);
  });
  it("has French with the right spacing and apostrophes", () => {
    for (const s of everything("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("never writes the French word for UNKNOWN, in either language", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(s, s).not.toMatch(/inconnu/i);
  });
  it("never gives an empty sentence", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(s.trim().length, JSON.stringify(s)).toBeGreaterThan(0);
  });
  it("gives different words in French and English for every sentence", () => {
    const en = everything("en");
    const fr = everything("fr");
    expect(en).toHaveLength(fr.length);
    let same = 0;
    for (let i = 0; i < en.length; i += 1) if (en[i] === fr[i]) same += 1;
    // Only strings made of a key and numbers can be the same in both.
    expect(same).toBeLessThanOrEqual(0);
  });
  it("says what a match does not mean, in both languages", () => {
    expect(copy.fingerprintLimit("en")).toMatch(/not say they are correct or up to date/);
    expect(copy.fingerprintLimit("fr")).toMatch(/ne dit pas qu’ils sont exacts ni à jour/);
  });
  it("never says the places are correct, complete, up to date or checked", () => {
    for (const l of LOCALES) {
      const claims = [...KINDS.map((k) => copy.comparisonHeadline(k, l)), copy.fingerprintIntro(l), copy.fingerprintCountLine(3, l)];
      for (const s of claims) {
        expect(s, s).not.toMatch(/\b(correct|accurate|complete|up to date|checked|confirmed|safe|accessible)\b/i);
        expect(s, s).not.toMatch(/exact|complet|à jour|confirmé|sûr|accessible/i);
      }
    }
  });
  it("says a headline for every kind, and none is shared", () => {
    for (const l of LOCALES) expect(new Set(KINDS.map((k) => copy.comparisonHeadline(k, l))).size).toBe(KINDS.length);
  });
  it("gives a different refusal for every problem", () => {
    for (const l of LOCALES) expect(new Set(PROBLEMS.map((p) => copy.fingerprintProblem(p, undefined, l))).size).toBe(PROBLEMS.length);
  });
  it("names the part of a code that cannot be read, only when one is known", () => {
    expect(copy.fingerprintProblem("malformed", "ids", "en")).toContain("(ids)");
    expect(copy.fingerprintProblem("malformed", undefined, "en")).not.toContain("(");
    expect(copy.fingerprintProblem("malformed", "ids", "fr")).toContain("(ids)");
  });
  it("uses singular and plural correctly", () => {
    expect(copy.fingerprintCountLine(1, "en")).toContain("1 place saved");
    expect(copy.fingerprintCountLine(2, "en")).toContain("2 places saved");
    expect(copy.fingerprintCountLine(1, "fr")).toContain("1 lieu enregistré ");
    expect(copy.fingerprintCountLine(2, "fr")).toContain("2 lieux enregistrés");
  });
  it("lists the differing groups in a sentence, and says nothing when nothing differs", () => {
    const [empty, same, details] = comparisons;
    expect(copy.comparisonGroups(empty!, "en")).toBe("");
    expect(copy.comparisonGroups(same!, "fr")).toBe("");
    const line = copy.comparisonGroups(details!, "en");
    expect(line).toMatch(/^1 of 16 groups differ: [0-9a-f]\.$/);
    expect(copy.comparisonGroups(details!, "fr")).toMatch(/^1 groupe sur 16 diffère[\s\S]: [0-9a-f]\.$/);
  });
  it("says how many places are listed when the list is cut", () => {
    expect(copy.hereListHeading(50, 30, "en")).toContain("first 30 of 50");
    expect(copy.hereListHeading(5, 5, "en")).toContain("(5)");
    expect(copy.hereListHeading(50, 30, "fr")).toContain("30 premiers sur 50");
  });
  it("has a row label for each of the sixteen groups", () => {
    const c = comparisons[3]!;
    expect(c.buckets.map((b) => b.key)).toEqual([...BUCKET_KEYS]);
    for (const b of c.buckets) {
      expect(copy.groupRowLabel(b, "en")).toContain(`Group ${b.key}:`);
      expect(copy.groupRowLabel(b, "fr")).toContain(`Groupe ${b.key}`);
    }
  });
  it("has a file name for each language, with no path or space", () => {
    for (const l of LOCALES) {
      for (const name of [copy.FINGERPRINT_FILENAMES[l], copy.COMPARISON_FILENAMES[l]]) expect(name).toMatch(/^[a-z0-9-]+\.txt$/);
    }
  });
});
