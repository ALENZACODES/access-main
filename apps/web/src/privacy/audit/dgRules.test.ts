import { describe, expect, it } from "vitest";
import { DG_CODES, auditSites, countFindings, formatFinding, sortFindings, type DgFinding } from "./dgRules";
import { DG_KINDS, type DgKind, type DgSite } from "./dgScan";

const site = (kind: DgKind, over: Partial<DgSite> = {}): DgSite => ({ path: "apps/web/src/a.ts", line: 1, kind, detail: "d", userNames: [], ...over });

describe("auditSites", () => {
  it.each([
    ["console", "dg-console"], ["debugger", "dg-debugger"], ["dialog", "dg-dialog"], ["error-hook", "dg-error-hook"], ["boundary", "dg-boundary"],
    ["error-text", "dg-error-text"], ["error-stack", "dg-error-stack"], ["error-string", "dg-error-string"],
  ] as const)("turns a %s site into %s", (kind, code) => expect(auditSites([site(kind)])).toEqual([{ code, path: "apps/web/src/a.ts", line: 1, detail: "d" }]));
  it("makes no finding of a thrown message that writes nothing a person typed", () => expect(auditSites([site("throw-template", { detail: "Error: id", userNames: [] })])).toEqual([]));
  it("makes a finding of a thrown message that writes a name like a typed value, and lists the names", () => {
    expect(auditSites([site("throw-template", { detail: "Error: query", userNames: ["query", "name"] })])).toEqual([{ code: "dg-throw-user-name", path: "apps/web/src/a.ts", line: 1, detail: "Error: query (names: query, name)" }]);
  });
  it("handles every kind the scan gives", () => {
    for (const k of DG_KINDS) expect(() => auditSites([site(k)])).not.toThrow();
  });
  it("gives the findings in path and line order", () => {
    const f = auditSites([site("console", { path: "apps/web/src/b.ts", line: 1 }), site("debugger", { line: 9 }), site("dialog", { line: 2 })]);
    expect(f.map((x) => `${x.path}:${x.line}`)).toEqual(["apps/web/src/a.ts:2", "apps/web/src/a.ts:9", "apps/web/src/b.ts:1"]);
  });
  it("gives no findings for no sites", () => expect(auditSites([])).toEqual([]));
  it("lists nine codes, each once", () => {
    expect(DG_CODES).toHaveLength(9);
    expect(new Set(DG_CODES).size).toBe(9);
  });
});

describe("sortFindings, formatFinding and countFindings", () => {
  const f = (path: string, line: number, code: DgFinding["code"], detail = "d"): DgFinding => ({ path, line, code, detail });
  it("sorts by path, then line, then code, then detail", () => {
    const s = sortFindings([f("b", 1, "dg-console"), f("a", 2, "dg-dialog", "y"), f("a", 2, "dg-dialog", "x"), f("a", 2, "dg-console"), f("a", 1, "dg-debugger")]);
    expect(s.map((x) => `${x.path}:${x.line} ${x.code} ${x.detail}`)).toEqual(["a:1 dg-debugger d", "a:2 dg-console d", "a:2 dg-dialog x", "a:2 dg-dialog y", "b:1 dg-console d"]);
  });
  it("does not change the list it is given", () => {
    const input = [f("b", 1, "dg-console"), f("a", 1, "dg-console")];
    sortFindings(input);
    expect(input[0]?.path).toBe("b");
  });
  it("writes a finding on one line", () => expect(formatFinding(f("apps/web/src/a.ts", 4, "dg-console", "log"))).toBe("apps/web/src/a.ts:4 dg-console: log"));
  it("counts the findings of each path and code", () => expect(countFindings([f("a", 1, "dg-console"), f("a", 2, "dg-console"), f("a", 3, "dg-dialog"), f("b", 1, "dg-console")])).toEqual([{ path: "a", code: "dg-console", count: 2 }, { path: "a", code: "dg-dialog", count: 1 }, { path: "b", code: "dg-console", count: 1 }]));
  it("counts nothing for no findings", () => expect(countFindings([])).toEqual([]));
});
