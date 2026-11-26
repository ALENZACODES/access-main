import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { Locale } from "./stateCopy";
import { DISAGREEMENT_FILTERS, DISAGREEMENT_KINDS, DISAGREEMENT_ORDERS } from "./tagNoteCheck";
import * as c from "./tagNoteCheckCopy";
import { lintFrench } from "./typography";

function lines(l: Locale): string[] {
  return [
    c.tnHeading(l), c.tnToggle(true, l), c.tnToggle(false, l), c.tnIntro(l), c.tnCoverage(1, l), c.tnCoverage(4, l), c.tnSummary(0, l), c.tnSummary(1, l), c.tnSummary(3, l), c.tnLeftOut(1, 0, l), c.tnLeftOut(2, 3, l), c.tnLeftOut(0, 1, l),
    c.tnNone(l), c.tnNoMatch(l), c.tnFilterGroup(l), c.tnOrderGroup(l), c.tnNoName(l), c.tnTagLine("yes", l), c.tnLegend(l), c.tnCaveat(l), c.tnDirectionLabel("access", l), c.tnDirectionLabel("barrier", l),
    c.tnWeightLine("one-sided", l), c.tnWeightLine("mixed", l), c.tnSaveText(l), c.tnSaveCsv(l), c.tnSavedLine("x.csv", l), c.tnCannotSave(l),
    ...DISAGREEMENT_FILTERS.map((f) => c.tnFilterLabel(f, l)), ...DISAGREEMENT_KINDS.map((k) => c.tnKindLine(k, l)), ...DISAGREEMENT_ORDERS.map((o) => c.tnOrderLabel(o, l)),
  ].filter((x) => x !== "");
}

describe("tag and note copy", () => {
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("labels every filter and order differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(DISAGREEMENT_FILTERS.map((f) => c.tnFilterLabel(f, l))).size).toBe(DISAGREEMENT_FILTERS.length);
      expect(new Set(DISAGREEMENT_ORDERS.map((o) => c.tnOrderLabel(o, l))).size).toBe(DISAGREEMENT_ORDERS.length);
    }
  });
  it("never says which of the tag and the note is right, and says it cannot", () => {
    for (const l of ["en", "fr"] as const) expect(c.tnIntro(l)).not.toMatch(/verif|vérif|confirmed|confirmé|incorrect|wrong\b|erreur/i);
    expect(c.tnIntro("en")).toContain("does not say which one is right");
    expect(c.tnCaveat("fr")).toContain("ne dit pas laquelle");
  });
  it("agrees in number", () => {
    expect(c.tnCoverage(1, "en")).toBe("1 place has a yes or no tag and a note to compare.");
    expect(c.tnCoverage(2, "en")).toContain("2 places have");
    expect(c.tnSummary(1, "en")).toBe("1 place points different ways.");
    expect(c.tnSummary(2, "en")).toBe("2 places point different ways.");
    expect(c.tnSummary(0, "en")).toBe("None of them point different ways.");
    expect(c.tnLeftOut(1, 0, "en")).toBe("1 place has no note.");
    expect(c.tnLeftOut(0, 0, "en")).toBe("");
  });
  it("writes UNKNOWN, not the French word, for an unknown tag", () => {
    expect(c.tnLeftOut(0, 2, "fr")).toContain("UNKNOWN");
    expect(c.tnLeftOut(0, 2, "fr")).not.toMatch(/inconnu/i);
  });
  it("has a CSV header of fixed English names", () => {
    expect(c.TN_CSV_HEADER).toEqual(["place_id", "place_name", "wheelchair_tag", "kind", "weight", "words_against_tag", "words_with_tag", "note"]);
  });
});
