// CI audit: where the App's code can send text out of the normal flow of its screens. There is no console call in the
// code of the page, no debugger statement, no browser dialog, no hook for errors nobody caught and no use of an
// error's stack; every place that shows the text of a caught error, every boundary that catches errors in the screens
// and every thrown message that writes a value named like a person's input is on the accepted list with a reason. It
// reads text. It cannot see an error reported by a library, and a name is taken for a caught error only when the same
// file binds it with catch.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareDg, formatDgProblems } from "./dgCompare";
import { DG_ACCEPTED, validateDgRegister } from "./dgRegister";
import { renderDgReport } from "./dgReport";
import { auditSites, countFindings } from "./dgRules";
import { countThrows, isScanned, scanDiagnostics, scanFile } from "./dgScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, ["apps/web/src"]);
const sites = scanDiagnostics(files);
const findings = auditSites(sites);
const count = (code: string): number => findings.filter((f) => f.code === code).length;

describe("the code of the App", () => {
  it("is read, so the audit cannot pass by finding nothing", () => {
    expect(files.filter((f) => isScanned(f.path)).length).toBeGreaterThan(500);
    expect(sites.filter((s) => s.kind === "throw-template").length).toBeGreaterThan(20);
    expect(countThrows(files)).toBeGreaterThan(300);
  });
  it("has a well-formed accepted list", () => expect(validateDgRegister()).toEqual([]));
  it("has findings that are exactly the accepted ones", () => expect(formatDgProblems(compareDg(findings, DG_ACCEPTED))).toBe(""));
  it("has a report that says no differences", () => {
    const text = renderDgReport({ files: files.filter((f) => isScanned(f.path)).length, throws: countThrows(files), sites, findings, accepted: DG_ACCEPTED, problems: compareDg(findings, DG_ACCEPTED) });
    expect(text).toContain("Differences from the accepted list: none.");
  });
});

describe("what the code does not do", () => {
  it("has no debugger statement, no browser dialog and no use of an error's stack", () => {
    expect(count("dg-debugger")).toBe(0);
    expect(count("dg-dialog")).toBe(0);
    expect(count("dg-error-stack")).toBe(0);
  });
  it("has one console call, in the command-line entry that runs in Node", () => {
    const c = findings.filter((f) => f.code === "dg-console");
    expect(c.map((f) => f.path)).toEqual(["apps/web/src/narrow/bin.mjs"]);
  });
  it("has no hook on the window or the process for errors nobody caught", () => {
    expect(findings.filter((f) => f.code === "dg-error-hook" && /window|self|globalThis|process|reportError/.test(f.detail))).toEqual([]);
  });
  it("keeps no error text in a boundary", () => {
    for (const f of findings.filter((x) => x.code === "dg-boundary")) {
      const src = readFileSync(`${ROOT}${f.path}`, "utf8");
      const at = src.indexOf("getDerivedStateFromError");
      expect(src.slice(at, at + 120), f.path).toContain("failed: true");
    }
  });
  it("has no component that catches an error and also reads it", () => expect(sites.filter((s) => s.kind === "boundary" && s.detail === "componentDidCatch")).toEqual([]));
  it("writes no value named like a person's input in a thrown message, outside the accepted field names", () => {
    const accepted = new Set(DG_ACCEPTED.filter((a) => a.code === "dg-throw-user-name").map((a) => a.path));
    for (const f of findings.filter((x) => x.code === "dg-throw-user-name")) expect(accepted.has(f.path), f.path).toBe(true);
  });
  it("counts the same places as the accepted rows add up to", () => expect(countFindings(findings).reduce((n, r) => n + r.count, 0)).toBe(DG_ACCEPTED.reduce((n, a) => n + a.count, 0)));
});

describe("a change to the real text is found", () => {
  const real = readFileSync(`${ROOT}apps/web/src/hub/PackageView.tsx`, "utf8");
  const at = (extra: string, path = "apps/web/src/hub/PackageView.tsx"): string[] => auditSites(scanFile({ path, text: `${real}\n${extra}\n` })).map((f) => f.code);
  it("finds nothing in the real file as it is", () => expect(at("")).toEqual(["dg-boundary"]));
  it("finds a console call added to a real file", () => expect(at("console.log(1);")).toContain("dg-console"));
  it("finds a debugger statement added to a real file", () => expect(at("function f() { debugger; }")).toContain("dg-debugger"));
  it("finds an alert added to a real file", () => expect(at("alert('x');")).toContain("dg-dialog"));
  it("finds a global error hook added to a real file", () => expect(at("window.onerror = () => {};")).toContain("dg-error-hook"));
  it("finds the stack of a caught error added to a real file", () => expect(at("try { f(); } catch (err) { show(err.stack); }")).toContain("dg-error-stack"));
  it("finds a thrown message that writes a typed value", () => expect(at("throw new Error(`Bad ${query}`);")).toContain("dg-throw-user-name"));
});
