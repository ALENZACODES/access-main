import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { Locale } from "./stateCopy";
import type { EarlierChange, EarlierProblem } from "./tagNoteEarlier";
import * as c from "./tagNoteMoreCopy";
import { SPREAD_ORDERS } from "./tagNoteSpread";
import { lintFrench } from "./typography";

const CHANGES: EarlierChange[] = ["new", "gone", "changed", "same"];
const PROBLEMS: EarlierProblem[] = ["empty", "too-large", "no-header", "missing-columns", "unterminated-quote", "too-many-rows", "no-rows"];

function lines(l: Locale): string[] {
  const cols = c.tsColumns(l);
  return [
    c.tsHeading(l), c.tsIntro(l), c.tsCaption(l), ...Object.values(cols), c.tsOrderGroup(l), c.tsNoKinds(l), c.tsSaveCsv(l),
    c.tsTotals({ kinds: 3, kindsWithDifferences: 2, checked: 9, flagged: 4 }, l), c.tsTotals({ kinds: 1, kindsWithDifferences: 1, checked: 1, flagged: 1 }, l), c.tsTotals({ kinds: 1, kindsWithDifferences: 0, checked: 2, flagged: 0 }, l),
    ...SPREAD_ORDERS.map((o) => c.tsOrderLabel(o, l)),
    c.teHeading(l), c.teIntro(l), c.teFileLabel(l), c.teCompare(l), c.teClear(l), c.teEmpty(l), c.teNotThisFile(l), c.teNothing(l), c.teCaveat(l),
    c.teSkipped(1, l), c.teSkipped(3, l), c.teSummary({ new: 1, gone: 2, changed: 0, same: 5 }, l), c.teSummary({ new: 0, gone: 0, changed: 1, same: 1 }, l),
    ...PROBLEMS.map((p) => c.teProblem(p, l, ["a", "b"])),
    ...CHANGES.flatMap((x) => [c.teChangeLabel(x, l), c.teChangeLine(x, l)]),
  ];
}

describe("by-kind and earlier-file copy", () => {
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
    it(`has no empty line in ${l}`, () => {
      for (const line of lines(l)) expect(line.trim(), line).not.toBe("");
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("labels every order and every change differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(SPREAD_ORDERS.map((o) => c.tsOrderLabel(o, l))).size).toBe(SPREAD_ORDERS.length);
      expect(new Set(CHANGES.map((x) => c.teChangeLabel(x, l))).size).toBe(CHANGES.length);
      expect(new Set(CHANGES.map((x) => c.teChangeLine(x, l))).size).toBe(CHANGES.length);
    }
  });
  it("puts a non-breaking space before the French percent sign only", () => {
    expect(c.tsPercent(40, "en")).toBe("40%");
    expect(c.tsPercent(40, "fr")).toBe("40 %");
  });
  it("lists the missing columns", () => {
    expect(c.teProblem("missing-columns", "en", ["kind", "note"])).toBe("Missing columns: kind, note.");
    expect(c.teProblem("missing-columns", "fr", ["kind"])).toContain("kind");
  });
  it("agrees in number", () => {
    expect(c.teSkipped(1, "en")).toContain("1 row was");
    expect(c.teSkipped(2, "en")).toContain("2 rows were");
    expect(c.tsTotals({ kinds: 1, kindsWithDifferences: 1, checked: 1, flagged: 1 }, "en")).toContain("1 kind has");
    expect(c.tsTotals({ kinds: 2, kindsWithDifferences: 1, checked: 2, flagged: 1 }, "en")).toContain("2 kinds have");
    expect(c.teSummary({ new: 2, gone: 0, changed: 1, same: 0 }, "fr")).toBe("2 nouveaux, 1 modifié, 0 en moins, 0 inchangé.");
  });
  it("never says which of the tag and the note is right, and makes no claim of checking", () => {
    for (const l of ["en", "fr"] as const) for (const line of lines(l)) expect(line.toLowerCase(), line).not.toMatch(/verified|vérifi|is correct|is wrong|est correct|est faux/);
  });
  it("uses the English and French file names", () => {
    expect(c.TS_CSV_NAME.en).toMatch(/\.csv$/);
    expect(c.TS_CSV_NAME.fr).toMatch(/\.csv$/);
    expect(c.TS_CSV_NAME.en).not.toBe(c.TS_CSV_NAME.fr);
    expect(c.TS_CSV_HEADER).toHaveLength(5);
  });
});
