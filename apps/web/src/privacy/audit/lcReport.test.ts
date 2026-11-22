import { describe, expect, it } from "vitest";
import { renderLcReport } from "./lcReport";
import type { LcFinding } from "./lcRules";
import type { LcKind, LcSite } from "./lcScan";

const s = (kind: LcKind, digits = 0): LcSite => ({ path: "apps/web/src/a.ts", line: 1, kind, digits, detail: "x" });
const f = (code: LcFinding["code"], path = "apps/web/src/a.ts"): LcFinding => ({ code, path, line: 1, detail: "x" });

describe("renderLcReport", () => {
  it("says what was read and that nothing differs", () => {
    const t = renderLcReport({ files: 3, sites: [s("fixed", 5), s("fixed", 5), s("fixed", 4), s("raw")], findings: [], problems: [] });
    expect(t).toContain("Read 3 files of the App's own code.");
    expect(t).toContain("Sites: 4 (3 fixed, 1 raw).");
    expect(t).toContain("Decimals written: 4 (about 11.1 m) in 1; 5 (about 1.1 m) in 2.");
    expect(t).toContain("Differences from the accepted list: none.");
  });
  it("counts findings and places, by code", () => {
    const t = renderLcReport({ files: 1, sites: [], findings: [f("lc-raw"), f("lc-raw"), f("lc-too-fine", "apps/web/src/b.ts")], problems: [] });
    expect(t).toContain("Findings: 3 in 2 places.");
    expect(t).toContain("  lc-raw: 2");
    expect(t).toContain("  lc-too-fine: 1");
    expect(t).not.toContain("lc-variable-digits");
  });
  it("uses the singular for one place and says none for no sites", () => {
    const t = renderLcReport({ files: 0, sites: [], findings: [f("lc-raw")], problems: [] });
    expect(t).toContain("in 1 place.");
    expect(t).toContain("Sites: 0 (none).");
    expect(t).not.toContain("Decimals written");
  });
  it("lists the differences", () => {
    const t = renderLcReport({ files: 1, sites: [], findings: [], problems: [{ code: "count-differs", path: "p", lcCode: "lc-raw", detail: "found 1, accepted 2" }] });
    expect(t).toContain("Differences from the accepted list: 1.");
    expect(t).toContain("  count-differs p lc-raw: found 1, accepted 2");
  });
});
