import { describe, expect, it } from "vitest";
import { LC_CODES, auditCoordinates, compareCoordinates, countLcFindings, formatLcProblems, validateLcRows, type LcAcceptRow, type LcFinding } from "./lcRules";
import type { LcKind, LcSite } from "./lcScan";

const site = (kind: LcKind, digits = 0, path = "apps/web/src/a.ts", line = 1): LcSite => ({ path, line, kind, digits, detail: kind });
const codes = (sites: LcSite[]): string[] => auditCoordinates(sites).map((f) => f.code);
const f = (code: LcFinding["code"], path = "apps/web/src/a.ts", line = 1): LcFinding => ({ code, path, line, detail: "x" });
const row = (code: LcAcceptRow["code"], count: number, path = "apps/web/src/a.ts", reason = "a reason"): LcAcceptRow => ({ path, code, count, reason });

describe("auditCoordinates", () => {
  it("lets five decimals and fewer pass", () => expect(codes([site("fixed", 5), site("fixed", 4), site("rounded", 5), site("fixed", 0)])).toEqual([]));
  it("finds more than five decimals, cut or rounded", () => expect(codes([site("fixed", 6), site("rounded", 8)])).toEqual(["lc-too-fine", "lc-too-fine"]));
  it("finds a count that is not written in the call", () => expect(codes([site("fixed-variable")])).toEqual(["lc-variable-digits"]));
  it("finds a number written as it is", () => expect(codes([site("raw")])).toEqual(["lc-raw"]));
  it("sorts by path, then line", () => {
    const r = auditCoordinates([site("raw", 0, "apps/web/src/b.ts", 1), site("raw", 0, "apps/web/src/a.ts", 9), site("raw", 0, "apps/web/src/a.ts", 2)]);
    expect(r.map((x) => `${x.path}:${x.line}`)).toEqual(["apps/web/src/a.ts:2", "apps/web/src/a.ts:9", "apps/web/src/b.ts:1"]);
  });
  it("gives nothing for no sites", () => expect(auditCoordinates([])).toEqual([]));
});

describe("compareCoordinates", () => {
  it("is empty when findings and rows agree", () => expect(compareCoordinates([f("lc-raw"), f("lc-raw", "apps/web/src/a.ts", 2)], [row("lc-raw", 2)])).toEqual([]));
  it("finds a finding that is not accepted", () => expect(compareCoordinates([f("lc-raw")], [])).toEqual([{ code: "finding-not-accepted", path: "apps/web/src/a.ts", lcCode: "lc-raw", detail: "1 not on the accepted list" }]));
  it("finds a row with no finding", () => expect(compareCoordinates([], [row("lc-raw", 1)]).map((p) => p.code)).toEqual(["accepted-not-found"]));
  it("finds a count that differs, either way", () => {
    expect(compareCoordinates([f("lc-raw")], [row("lc-raw", 2)])[0]).toMatchObject({ code: "count-differs", detail: "found 1, accepted 2" });
    expect(compareCoordinates([f("lc-raw"), f("lc-raw")], [row("lc-raw", 1)])[0]).toMatchObject({ detail: "found 2, accepted 1" });
  });
  it("adds up the rows of one file and code", () => expect(compareCoordinates([f("lc-raw"), f("lc-raw")], [row("lc-raw", 1, "apps/web/src/a.ts", "one"), row("lc-raw", 1, "apps/web/src/a.ts", "two")])).toEqual([]));
  it("does not take a row for another code", () => expect(compareCoordinates([f("lc-raw")], [row("lc-too-fine", 1)]).map((p) => p.code).sort()).toEqual(["accepted-not-found", "finding-not-accepted"]));
  it("sorts by code, then path", () => expect(compareCoordinates([f("lc-raw", "apps/web/src/b.ts"), f("lc-raw", "apps/web/src/a.ts")], []).map((p) => p.path)).toEqual(["apps/web/src/a.ts", "apps/web/src/b.ts"]));
  it("writes problems as lines", () => {
    expect(formatLcProblems([])).toBe("");
    expect(formatLcProblems(compareCoordinates([f("lc-raw")], []))).toBe("finding-not-accepted apps/web/src/a.ts lc-raw: 1 not on the accepted list");
  });
});

describe("countLcFindings and validateLcRows", () => {
  it("counts per file and code", () => expect(countLcFindings([f("lc-raw"), f("lc-raw"), f("lc-too-fine")])).toEqual([{ path: "apps/web/src/a.ts", code: "lc-raw", count: 2 }, { path: "apps/web/src/a.ts", code: "lc-too-fine", count: 1 }]));
  const ok = row("lc-raw", 1, "apps/web/src/a.ts", "Writes a number as it is, with all its decimals, into a text.");
  it("passes a good row", () => expect(validateLcRows([ok])).toEqual([]));
  it("refuses a code that is not of this audit, a bad count, a short reason and a claim", () => {
    expect(validateLcRows([{ ...ok, code: "x" as never }])[0]).toContain("not a code");
    for (const count of [0, -1, 1.5]) expect(validateLcRows([{ ...ok, count }])[0]).toContain("count must be");
    expect(validateLcRows([{ ...ok, reason: "fine" }])[0]).toContain("too short");
    expect(validateLcRows([{ ...ok, reason: `${ok.reason} It is private and safe.` }])[0]).toContain("claims more");
  });
  it("refuses the same row twice and rows out of order", () => {
    expect(validateLcRows([ok, ok]).join("\n")).toContain("the same row twice");
    expect(validateLcRows([{ ...ok, path: "apps/web/src/b.ts" }, ok]).join("\n")).toContain("out of order");
  });
  it("has three codes", () => expect(LC_CODES).toHaveLength(3));
});
