// CI audit: where the App's code reads the clock or writes a time. The rules are in tmRules.ts and the accepted list
// is in tmRegister.ts. It reads text only. It cannot see a time that a library writes, and a site says what the code
// does at that line, not where the value goes.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareTm, foldersWithClock, formatTmProblems } from "./tmCompare";
import { TM_ACCEPTED, TM_FOLDERS, validateTmRegister } from "./tmRegister";
import { auditTime, countFindings } from "./tmRules";
import { countKinds, isTimeScanned, scanTime } from "./tmScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, ["apps/web/src"]);
const sites = scanTime(files);
const known = new Set(TM_FOLDERS);
const findings = auditTime(sites, known);

describe("time in the code of the App", () => {
  it("is read, so the audit cannot pass by finding nothing", () => {
    expect(files.filter((f) => isTimeScanned(f.path)).length).toBeGreaterThan(500);
    const c = countKinds(sites);
    expect(c["clock-ms"]).toBeGreaterThan(50);
    expect(c["stamp-full"]).toBeGreaterThan(30);
    expect(c["local-getter"]).toBeGreaterThan(30);
  });
  it("has a well-formed accepted list", () => expect(validateTmRegister()).toEqual([]));
  it("has findings that are exactly the accepted ones", () => {
    const problems = compareTm(findings, TM_ACCEPTED, foldersWithClock(sites), TM_FOLDERS);
    expect(formatTmProblems(problems)).toBe("");
  });
  it("counts the same places as the accepted rows add up to", () => {
    const found = countFindings(findings.filter((f) => f.code !== "tm-unlisted-folder")).reduce((n, r) => n + r.count, 0);
    expect(found).toBe(TM_ACCEPTED.reduce((n, r) => n + r.count, 0));
  });
});

describe("what the code does not do", () => {
  it("does not read the time zone of the device", () => expect(sites.filter((s) => s.kind === "tz-read")).toEqual([]));
  it("does not write a time zone name or an offset into a format", () => expect(sites.filter((s) => s.kind === "tz-read" || /timeZoneName/.test(s.detail))).toEqual([]));
  it("writes no time into text from the code of the privacy folder", () => expect(findings.filter((f) => f.code === "tm-clock-in-text" && f.path.includes("/privacy/"))).toEqual([]));
  it("has a clock call where the privacy code is given a time to use, only as the default of a parameter", () => {
    const calls = sites.filter((s) => s.kind === "clock-ms" && s.path.startsWith("apps/web/src/privacy/"));
    for (const c of calls) {
      const line = (files.find((x) => x.path === c.path)?.text ?? "").split("\n")[c.line - 1] ?? "";
      expect(line, `${c.path}:${c.line}`).toMatch(/=\s*\(\)\s*(:\s*Date\s*)?=>\s*new Date\(\)|=\s*\(\)\s*=>\s*new Date\(\)/);
    }
  });
  it("keeps every privacy file that writes a full time as UTC, by the form of the call", () => {
    for (const s of sites.filter((x) => x.kind === "stamp-full" && x.path.startsWith("apps/web/src/privacy/"))) expect(s.detail).toBe("toISOString()");
  });
});

describe("a change to the real text is found", () => {
  const real = files.find((f) => f.path === "apps/web/src/privacy/panel/localData.ts")?.text ?? "";
  const added = (extra: string): string[] => auditTime(scanTime([{ path: "apps/web/src/privacy/panel/localData.ts", text: `${real}\n${extra}\n` }]), known).map((f) => f.code);
  const base = added("");
  const extra = (text: string): string[] => {
    const a = added(text);
    const rest = [...base];
    for (const c of a) {
      const i = rest.indexOf(c);
      if (i >= 0) rest.splice(i, 1);
      else return [c];
    }
    return [];
  };
  it("finds nothing new in the real file as it is", () => expect(extra("")).toEqual([]));
  it("finds a time zone read added to it", () => expect(added("const z = Intl.DateTimeFormat().resolvedOptions().timeZone;")).toContain("tm-tz-read"));
  it("finds a clock call added to it", () => expect(added("const t = Date.now();")).toContain("tm-privacy-clock"));
  it("finds a time written into an identifier added to it", () => expect(added("const id = `k-${Date.now()}`;")).toContain("tm-clock-in-text"));
  it("finds a getter in the time zone of the device added to it", () => expect(extra("const h = new Date(1).getHours();")).toEqual(["tm-local-getter"]));
  it("finds a timer added to it", () => expect(added("const t = performance.now();")).toContain("tm-hires-timer"));
  it("does not find a clock call in a comment added to it", () => expect(extra("// const t = Date.now();")).toEqual([]));
});
