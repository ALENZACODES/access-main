import { describe, expect, it } from "vitest";
import { compareTm, foldersWithClock, formatTmProblems } from "./tmCompare";
import type { TmAcceptRow } from "./tmRegister";
import type { TmCode, TmFinding } from "./tmRules";
import type { TmKind, TmSite } from "./tmScan";

const f = (code: TmCode, path = "apps/web/src/a.ts", line = 1): TmFinding => ({ code, path, line, detail: "x" });
const row = (code: TmCode, count: number, path = "apps/web/src/a.ts", reason = "a reason"): TmAcceptRow => ({ path, code, count, reason });
const none = new Set<string>();

describe("compareTm", () => {
  it("is empty when findings and rows agree", () => expect(compareTm([f("tm-local-getter"), f("tm-local-getter", "apps/web/src/a.ts", 2)], [row("tm-local-getter", 2)], none, [])).toEqual([]));
  it("finds a finding that is not accepted", () => {
    const p = compareTm([f("tm-local-getter")], [], none, []);
    expect(p).toEqual([{ code: "finding-not-accepted", path: "apps/web/src/a.ts", tmCode: "tm-local-getter", detail: "1 not on the accepted list" }]);
  });
  it("finds a row with no finding", () => {
    expect(compareTm([], [row("tm-hires-timer", 1)], none, []).map((p) => p.code)).toEqual(["accepted-not-found"]);
  });
  it("finds a count that differs, either way", () => {
    expect(compareTm([f("tm-local-getter")], [row("tm-local-getter", 2)], none, [])[0]).toMatchObject({ code: "count-differs", detail: "found 1, accepted 2" });
    expect(compareTm([f("tm-local-getter"), f("tm-local-getter")], [row("tm-local-getter", 1)], none, [])[0]).toMatchObject({ code: "count-differs", detail: "found 2, accepted 1" });
  });
  it("adds up rows of one file and code that have different reasons", () => {
    expect(compareTm([f("tm-privacy-clock"), f("tm-privacy-clock")], [row("tm-privacy-clock", 1, "apps/web/src/a.ts", "one"), row("tm-privacy-clock", 1, "apps/web/src/a.ts", "two")], none, [])).toEqual([]);
  });
  it("reports an unlisted folder from its finding, not from a row", () => {
    const p = compareTm([f("tm-unlisted-folder", "apps/web/src/zzz/a.ts")], [], none, []);
    expect(p).toEqual([{ code: "unlisted-folder", path: "apps/web/src/zzz/a.ts", tmCode: "tm-unlisted-folder", detail: "zzz" }]);
  });
  it("reports a listed folder that holds no clock call", () => {
    expect(compareTm([], [], new Set(["a"]), ["a", "b"])).toEqual([{ code: "stale-folder", path: "b", tmCode: "", detail: "listed, but no clock call or written time was found in it" }]);
  });
  it("sorts by code, then path", () => {
    const p = compareTm([f("tm-local-getter", "apps/web/src/b.ts"), f("tm-local-getter", "apps/web/src/a.ts")], [], none, []);
    expect(p.map((x) => x.path)).toEqual(["apps/web/src/a.ts", "apps/web/src/b.ts"]);
  });
  it("is not fooled by a row for another code in the same file", () => {
    expect(compareTm([f("tm-local-getter")], [row("tm-local-format", 1)], none, []).map((p) => p.code).sort()).toEqual(["accepted-not-found", "finding-not-accepted"]);
  });
});

describe("formatTmProblems", () => {
  it("writes one line each and nothing for no problems", () => {
    expect(formatTmProblems([])).toBe("");
    expect(formatTmProblems(compareTm([f("tm-local-getter")], [], none, []))).toBe("finding-not-accepted apps/web/src/a.ts tm-local-getter: 1 not on the accepted list");
  });
  it("leaves out the code of a stale folder", () => expect(formatTmProblems(compareTm([], [], none, ["b"]))).toBe("stale-folder b: listed, but no clock call or written time was found in it"));
});

describe("foldersWithClock", () => {
  const s = (kind: TmKind, path: string): TmSite => ({ path, line: 1, kind, detail: "", inText: false });
  it("lists folders with a clock call or a written time, without the privacy folder", () => {
    const set = foldersWithClock([s("clock-ms", "apps/web/src/hub/a.ts"), s("stamp-full", "apps/web/src/pages/a.ts"), s("stamp-cut", "apps/web/src/map/a.ts"), s("clock-ms", "apps/web/src/privacy/panel/a.ts")]);
    expect([...set].sort()).toEqual(["hub", "map", "pages"]);
  });
  it("does not list a folder that only has other kinds", () => expect(foldersWithClock([s("local-getter", "apps/web/src/hub/a.ts"), s("utc-format", "apps/web/src/hub/b.ts")]).size).toBe(0));
});
