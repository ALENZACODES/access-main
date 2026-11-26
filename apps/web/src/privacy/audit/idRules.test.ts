import { describe, expect, it } from "vitest";
import { ID_ACCEPTABLE, ID_CODES, auditSites, codeFor, countFindings, formatFinding, isAcceptable, sortFindings } from "./idRules";
import type { IdKind, IdSite } from "./idScan";

const site = (kind: IdKind, moves = false, path = "p", line = 1): IdSite => ({ path, line, kind, detail: "d", moves });

describe("codeFor", () => {
  it.each([
    ["uuid", "id-uuid"],
    ["random-bytes", "id-random-bytes"],
    ["math-random", "id-math-random"],
    ["time-id", "id-time-id"],
    ["device-high", "id-device-high"],
    ["device-low", "id-device-low"],
  ] as const)("%s gives %s", (kind, code) => expect(codeFor(site(kind))).toBe(code));
  it("gives the stronger code for Math.random on a line that stores or sends", () => expect(codeFor(site("math-random", true))).toBe("id-math-random-moves"));
  it("does not change another kind on a line that stores or sends", () => expect(codeFor(site("uuid", true))).toBe("id-uuid"));
});

describe("acceptable codes", () => {
  it("never include a high device read or Math.random on a line that moves data", () => {
    expect(ID_ACCEPTABLE).not.toContain("id-device-high");
    expect(ID_ACCEPTABLE).not.toContain("id-math-random-moves");
  });
  it("are all codes", () => {
    for (const c of ID_ACCEPTABLE) expect(ID_CODES).toContain(c);
  });
  it("answer isAcceptable", () => {
    expect(isAcceptable("id-uuid")).toBe(true);
    expect(isAcceptable("id-device-high")).toBe(false);
    expect(isAcceptable("id-math-random-moves")).toBe(false);
  });
});

describe("auditSites, countFindings, sortFindings and formatFinding", () => {
  const findings = auditSites([site("uuid", false, "b", 4), site("math-random", true, "a", 9), site("math-random", false, "a", 2)]);
  it("gives a finding for each site, keeping the place", () => expect(findings.map((f) => `${f.path}:${f.line}:${f.code}`)).toEqual(["b:4:id-uuid", "a:9:id-math-random-moves", "a:2:id-math-random"]));
  it("counts every code, with zero for none", () => {
    const c = countFindings(findings);
    expect(c["id-uuid"]).toBe(1);
    expect(c["id-math-random"]).toBe(1);
    expect(c["id-math-random-moves"]).toBe(1);
    expect(c["id-device-high"]).toBe(0);
    expect(Object.keys(c)).toEqual([...ID_CODES]);
  });
  it("sorts by path, then line", () => expect(sortFindings(findings).map((f) => `${f.path}:${f.line}`)).toEqual(["a:2", "a:9", "b:4"]));
  it("does not change the list it sorts", () => {
    const before = findings.map((f) => f.line);
    sortFindings(findings);
    expect(findings.map((f) => f.line)).toEqual(before);
  });
  it("writes a finding on one line", () => expect(formatFinding({ path: "a.ts", line: 3, code: "id-uuid", detail: "randomUUID" })).toBe("a.ts:3: id-uuid: randomUUID"));
});
