import { describe, expect, it } from "vitest";
import { TM_ACCEPTABLE, TM_CODES, auditTime, countFindings, folderOf, formatTmFinding, isPrivacyPath } from "./tmRules";
import type { TmKind, TmSite } from "./tmScan";

const site = (kind: TmKind, path = "apps/web/src/pages/A.tsx", extra: Partial<TmSite> = {}): TmSite => ({ path, line: 1, kind, detail: kind, inText: false, ...extra });
const known = new Set(["pages", "hub"]);
const codes = (sites: TmSite[], k = known): string[] => auditTime(sites, k).map((f) => f.code);

describe("folderOf", () => {
  it.each([
    ["apps/web/src/pages/A.tsx", "pages"],
    ["apps/web/src/offline/robust/x.ts", "offline"],
    ["apps/web/src/main.tsx", "(src)"],
    ["packages/x/y.ts", "(outside)"],
  ])("%s -> %s", (p, f) => expect(folderOf(p)).toBe(f));
  it("isPrivacyPath is for the privacy folder only", () => {
    expect(isPrivacyPath("apps/web/src/privacy/panel/a.ts")).toBe(true);
    expect(isPrivacyPath("apps/web/src/privacyx/a.ts")).toBe(false);
  });
});

describe("auditTime", () => {
  it("finds a time zone read anywhere", () => {
    expect(codes([site("tz-read")])).toEqual(["tm-tz-read"]);
    expect(codes([site("tz-read", "apps/web/src/privacy/panel/a.ts")])).toEqual(["tm-tz-read"]);
  });
  it("finds a timer, a local getter and a local format", () => {
    expect(codes([site("timer-hires"), site("local-getter"), site("local-format")])).toEqual(["tm-hires-timer", "tm-local-format", "tm-local-getter"]);
  });
  it("does not find a UTC format", () => expect(codes([site("utc-format")])).toEqual([]));
  it("finds a clock call written into text, as well as the folder rule", () => {
    expect(codes([site("clock-ms", "apps/web/src/pages/A.tsx", { inText: true })])).toEqual(["tm-clock-in-text"]);
    expect(codes([site("clock-ms", "apps/web/src/zzz/A.tsx", { inText: true })]).sort()).toEqual(["tm-clock-in-text", "tm-unlisted-folder"]);
  });
  it("does not find a clock call in a known folder", () => expect(codes([site("clock-ms"), site("stamp-full"), site("stamp-cut")])).toEqual([]));
  it("finds a clock call in a folder that is not known", () => {
    const f = auditTime([site("stamp-full", "apps/web/src/zzz/A.tsx")], known);
    expect(f.map((x) => x.code)).toEqual(["tm-unlisted-folder"]);
    expect(f[0]?.detail).toContain("zzz");
  });
  it("finds every clock call and written time in the privacy folder, even when the folder is known", () => {
    const k = new Set(["privacy"]);
    expect(codes([site("clock-ms", "apps/web/src/privacy/panel/a.ts"), site("stamp-full", "apps/web/src/privacy/panel/a.ts"), site("stamp-cut", "apps/web/src/privacy/panel/a.ts")], k)).toEqual(["tm-privacy-clock", "tm-privacy-clock", "tm-privacy-clock"]);
  });
  it("sorts by path, then line, then code", () => {
    const f = auditTime([site("local-getter", "apps/web/src/b.ts", { line: 1 }), site("local-getter", "apps/web/src/a.ts", { line: 9 }), site("local-getter", "apps/web/src/a.ts", { line: 2 })], known);
    expect(f.map((x) => `${x.path}:${x.line}`)).toEqual(["apps/web/src/a.ts:2", "apps/web/src/a.ts:9", "apps/web/src/b.ts:1"]);
  });
  it("gives nothing for no sites", () => expect(auditTime([], known)).toEqual([]));
});

describe("countFindings and formatTmFinding", () => {
  it("counts per file and code", () => {
    const f = auditTime([site("local-getter"), site("local-getter"), site("local-format")], known);
    expect(countFindings(f)).toEqual([
      { code: "tm-local-format", path: "apps/web/src/pages/A.tsx", count: 1 },
      { code: "tm-local-getter", path: "apps/web/src/pages/A.tsx", count: 2 },
    ]);
  });
  it("writes a finding as one line", () => expect(formatTmFinding({ code: "tm-tz-read", path: "p.ts", line: 4, detail: "getTimezoneOffset" })).toBe("p.ts:4 tm-tz-read: getTimezoneOffset"));
});

describe("the lists", () => {
  it("has seven codes and none of them twice", () => expect(new Set(TM_CODES).size).toBe(7));
  it("never lets a time zone read or an unlisted folder be accepted by a row", () => {
    expect(TM_ACCEPTABLE).not.toContain("tm-tz-read");
    expect(TM_ACCEPTABLE).not.toContain("tm-unlisted-folder");
  });
  it("lists only codes that exist", () => {
    for (const c of TM_ACCEPTABLE) expect(TM_CODES).toContain(c);
  });
});
