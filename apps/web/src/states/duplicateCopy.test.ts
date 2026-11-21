import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import * as c from "./duplicateCopy";
import { DUPLICATE_REASONS, STRICTNESS_LEVELS } from "./duplicateScore";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

function lines(l: Locale): string[] {
  const f = c.dupMemberFields(l);
  return [
    c.dupHeading(l), c.dupToggle(true, l), c.dupToggle(false, l), c.dupIntro(l), c.dupLevelGroupLabel(l), c.dupNone(l), c.dupNoPlaces(l), c.dupSummary(1, 2, l), c.dupSummary(3, 7, l), c.dupSkippedLine(1, l), c.dupSkippedLine(4, l),
    c.dupGroupLabel(2, 3, l), c.dupNoName(l), c.dupTagsDiffer(l), ...Object.values(f), c.dupUnknownValue(l), c.dupMetresLine(12.4, l), c.dupSaveText(l), c.dupSaveCsv(l), c.dupSavedLine("x.csv", l), c.dupCannotSave(l), c.dupTextCaveat(l),
    ...STRICTNESS_LEVELS.map((s) => c.dupLevelLabel(s, l)), ...DUPLICATE_REASONS.map((r) => c.dupReasonLabel(r, l)), c.dupReasonsLine(["same-name", "near"], l),
  ];
}

describe("duplicate copy", () => {
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("labels every level and reason once and differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(STRICTNESS_LEVELS.map((s) => c.dupLevelLabel(s, l))).size).toBe(3);
      expect(new Set(DUPLICATE_REASONS.map((r) => c.dupReasonLabel(r, l))).size).toBe(DUPLICATE_REASONS.length);
    }
  });
  it("writes UNKNOWN in both languages", () => {
    expect(c.dupUnknownValue("fr")).toBe("UNKNOWN");
    expect(c.dupUnknownValue("en")).toBe("UNKNOWN");
  });
  it("says nothing for a zero count and agrees in number", () => {
    expect(c.dupSkippedLine(0, "en")).toBe("");
    expect(c.dupSummary(1, 2, "en")).toBe("1 group of places that look alike, 2 places in all.");
    expect(c.dupSummary(2, 4, "en")).toContain("2 groups");
    expect(c.dupSummary(1, 2, "fr")).toContain("1 groupe ");
    expect(c.dupSkippedLine(1, "en")).toContain("was left out");
    expect(c.dupSkippedLine(2, "en")).toContain("were left out");
  });
  it("never claims a record is right, checked or confirmed", () => {
    for (const l of ["en", "fr"] as const) expect(c.dupIntro(l)).not.toMatch(/verif|vérif|confirmed|confirmé|correct\b/i);
    expect(c.dupIntro("en")).toContain("cannot tell you which record is right");
  });
  it("rounds the distance", () => {
    expect(c.dupMetresLine(12.4, "en")).toBe("12 m apart");
    expect(c.dupMetresLine(12.6, "en")).toBe("13 m apart");
  });
  it("has a CSV header of fixed English column names", () => {
    expect(c.DUP_CSV_HEADER[0]).toBe("group");
    expect(c.DUP_CSV_HEADER).toHaveLength(10);
  });
});
