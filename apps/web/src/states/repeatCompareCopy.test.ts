import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import * as c from "./repeatCompareCopy";
import { REPEAT_FIELDS, type FieldState } from "./repeatCompare";
import { findDuplicates } from "./duplicateGroups";
import { place } from "./placeFixtures";
import { repeatStats } from "./repeatStats";
import { lintFrench } from "./typography";
import type { Locale } from "./stateCopy";

const STATES: FieldState[] = ["same", "differs", "partial", "none"];
function lines(l: Locale): string[] {
  return [
    ...c.ALL_REPEAT_FIELD_LABELS(l), ...STATES.map((s) => c.repeatStateLabel(s, l)), c.repeatCompareToggle(true, l), c.repeatCompareToggle(false, l), c.repeatCompareCaption(2, l), c.repeatCompareState(l), c.repeatCompareFieldHeader(l), c.repeatCompareMember("a1", l),
    c.repeatCompareNotGiven(l), c.repeatCompareDiffering([], l), c.repeatCompareDiffering(["name", "tag"], l), c.repeatCompareSpread(40, l), c.repeatCompareCaveat(l),
  ];
}

describe("repeat comparison copy", () => {
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("labels every field and state once and differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(c.ALL_REPEAT_FIELD_LABELS(l)).size).toBe(REPEAT_FIELDS.length);
      expect(new Set(STATES.map((s) => c.repeatStateLabel(s, l))).size).toBe(STATES.length);
    }
  });
  it("names the differing fields in the table's wording", () => {
    expect(c.repeatCompareDiffering(["name", "tag"], "en")).toBe("They differ on: Name, Wheelchair tag.");
    expect(c.repeatCompareDiffering([], "en")).toContain("agree on every field");
  });
  it("says nothing about a spread that is not known", () => {
    expect(c.repeatCompareSpread(null, "en")).toBe("");
    expect(c.repeatCompareSpread(40, "en")).toContain("40 m");
  });
  it("never claims a value is right or confirmed", () => {
    for (const l of ["en", "fr"] as const) expect(c.repeatCompareCaveat(l)).toMatch(/pas quelle valeur est la bonne|does not say which value is right/);
  });
});

describe("repeatStatsLine", () => {
  const tw = (id: string, over: Record<string, unknown> = {}) => place(id, { name: "Alpha Hall", address: "5 Elm Street", category: "cafe", lat: 43.65, lon: -79.38, ...over });
  const stats = repeatStats(findDuplicates([tw("a", { wheelchair: "yes" }), tw("b", { wheelchair: "no" })]));
  it("gives the sizes, the reasons that carried a group and the tag disagreements", () => {
    const line = c.repeatStatsLine(stats, "en");
    expect(line).toContain("1 of two places, 0 larger (up to 2).");
    expect(line).toContain("same name (1)");
    expect(line).toContain("1 group reports different tags.");
  });
  it("leaves out a reason no group had", () => {
    expect(c.repeatStatsLine(stats, "en")).not.toContain("similar name");
  });
  it("passes the copy lint and French typography", () => {
    for (const l of ["en", "fr"] as const) expect(lintCopy(c.repeatStatsLine(stats, l), l)).toEqual([]);
    expect(lintFrench(c.repeatStatsLine(stats, "fr"))).toEqual([]);
  });
  it("has no tag sentence when the tags agree", () => {
    const s = repeatStats(findDuplicates([tw("a"), tw("b")]));
    expect(c.repeatStatsLine(s, "en")).not.toContain("different tags");
  });
});
