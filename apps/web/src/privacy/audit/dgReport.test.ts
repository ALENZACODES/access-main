import { describe, expect, it } from "vitest";
import { renderDgReport } from "./dgReport";
import type { DgFinding } from "./dgRules";
import type { DgSite } from "./dgScan";

const finding: DgFinding = { code: "dg-console", path: "apps/web/src/a.ts", line: 3, detail: "log" };
const tpl: DgSite = { path: "apps/web/src/a.ts", line: 1, kind: "throw-template", detail: "Error: a", userNames: [] };
const base = { files: 10, throws: 7, sites: [tpl, tpl], findings: [], accepted: [], problems: [] };

describe("renderDgReport", () => {
  it("says how many files were read, the throws and the thrown messages that write a value", () => {
    const l = renderDgReport(base).split("\n");
    expect(l[0]).toBe("Read 10 files of the App's own code.");
    expect(l[1]).toBe("Throw statements: 7; thrown messages that write a value in ${ }: 2.");
  });
  it("says there are no findings", () => expect(renderDgReport(base)).toContain("Findings: 0 in 0 places."));
  it("lists each finding under the count", () => {
    const t = renderDgReport({ ...base, findings: [finding, finding] });
    expect(t).toContain("Findings: 2 in 1 places.");
    expect(t).toContain("  apps/web/src/a.ts:3 dg-console: log");
  });
  it("counts the accepted rows, and says when there are no differences", () => {
    const t = renderDgReport({ ...base, accepted: [{ path: "p", code: "dg-console", count: 1, reason: "A reason that is long enough." }] });
    expect(t).toContain("Findings accepted as they stand: 1 rows.");
    expect(t.endsWith("Differences from the accepted list: none.")).toBe(true);
  });
  it("lists the differences", () => expect(renderDgReport({ ...base, problems: [{ code: "accepted-gone", key: "k", detail: "d" }] })).toContain("Differences from the accepted list: 1.\n  accepted-gone k: d"));
  it("has no trailing line break", () => expect(renderDgReport(base).endsWith("\n")).toBe(false));
});
