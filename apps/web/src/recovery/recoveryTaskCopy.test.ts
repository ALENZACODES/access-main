import { describe, expect, it } from "vitest";
import { taskBoardCopy } from "./recoveryTaskCopy";

describe("task board translations and interaction semantics", () => {
  it("has meaningful EN and FR headings", () => {
    for (const locale of ["en", "fr"] as const) {
      const copy = taskBoardCopy(locale);
      expect(copy.heading.trim().length).toBeGreaterThan(5);
      expect(copy.intro.trim().length).toBeGreaterThan(20);
      expect(copy.noAutomatic.trim().length).toBeGreaterThan(20);
    }
  });

  it("keeps unknown visibly unknown", () => {
    expect(taskBoardCopy("en").risks.unknown).toBe("UNKNOWN");
    expect(taskBoardCopy("fr").risks.unknown).toBe("UNKNOWN");
  });

  it("contains every status label in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const labels = Object.values(taskBoardCopy(locale).taskStates);
      expect(labels).toHaveLength(4);
      expect(labels.every((label) => label.length > 2)).toBe(true);
    }
  });

  it("contains every task kind label in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const labels = Object.values(taskBoardCopy(locale).taskKinds);
      expect(labels).toHaveLength(5);
      expect(new Set(labels).size).toBe(5);
    }
  });

  it("contains each import issue translation", () => {
    const en = taskBoardCopy("en");
    const fr = taskBoardCopy("fr");
    expect(Object.keys(en.issue).sort()).toEqual(Object.keys(fr.issue).sort());
    for (const key of Object.keys(en.issue) as Array<keyof typeof en.issue>) {
      expect(fr.issue[key].trim()).not.toBe("");
      expect(en.issue[key].trim()).not.toBe("");
    }
  });

  it("does not instruct the user to trust a stored pack based on a closed task", () => {
    expect(taskBoardCopy("en").noAutomatic).toContain("does not change");
    expect(taskBoardCopy("fr").noAutomatic).toContain("ne modifie pas");
  });
});
