import { describe, expect, it } from "vitest";
import { assertGuardRegister, GUARD_ACCEPTABLE, GUARD_ACCEPTED, GUARD_REGISTER, validateGuardRegister, type GuardAcceptRow, type GuardRegister } from "./guardRegister";
import { GUARD_CODES } from "./guardRules";

const reg = (over: Partial<GuardRegister> = {}): GuardRegister => ({ tsFlags: { "a.json": "strict=true" }, suppressions: [], lists: {}, packages: [], ...over });
const row: GuardAcceptRow = { path: "a.ts", code: "suppress-no-reason", count: 1, reason: "A real reason that is long enough to count." };
const msgs = (r: GuardRegister, a: readonly GuardAcceptRow[] = []): string[] => validateGuardRegister(r, a).map((p) => p.message);

describe("the real register", () => {
  it("is valid", () => expect(validateGuardRegister()).toEqual([]));
  it("does not throw when asserted", () => expect(() => assertGuardRegister()).not.toThrow());
  it("lists strict as true for every configuration", () => {
    for (const [p, v] of Object.entries(GUARD_REGISTER.tsFlags)) expect(v, p).toContain("strict=true");
  });
  it("lists the index flag as true for all but the two configurations that are accepted without it", () => {
    const without = Object.entries(GUARD_REGISTER.tsFlags).filter(([, v]) => !v.includes("noUncheckedIndexedAccess=true")).map(([p]) => p);
    expect(without).toEqual(["packages/schema/tsconfig.json", "packages/sr-switch/tsconfig.json"]);
  });
  it("lists the root package file and the web app's", () => expect(GUARD_REGISTER.packages).toEqual(expect.arrayContaining(["package.json", "apps/web/package.json"])));
  it("keeps the test include and the lint ignore lists", () => {
    expect(GUARD_REGISTER.lists["vitest.config.ts"]?.["include"]?.length).toBeGreaterThan(5);
    expect(GUARD_REGISTER.lists["eslint.config.js"]?.["ignores"]).toContain("**/node_modules/**");
  });
  it("does not exclude the privacy tests from the test run", () => {
    const ex = GUARD_REGISTER.lists["vitest.config.ts"]?.["exclude"] ?? [];
    expect(ex.some((e) => e.includes("privacy"))).toBe(false);
  });
});

describe("the accepted list", () => {
  it("has only codes that may be accepted, each with a real reason", () => {
    for (const a of GUARD_ACCEPTED) {
      expect(GUARD_ACCEPTABLE).toContain(a.code);
      expect(a.reason.length).toBeGreaterThan(40);
    }
  });
  it("never allows a check switched off for a whole file, a retry or a failure turned into success", () => {
    for (const never of ["suppress-nocheck", "suppress-ignore", "suppress-blanket", "suppress-file-wide", "config-retry", "config-bail", "config-timeout", "config-pass-with-no-tests", "config-allow-only", "config-lint-off", "script-failure-ignored", "script-no-tests-pass", "script-retry", "script-timeout", "script-hook-skipped", "script-force", "script-pipe-to-shell", "ts-strict-off", "ts-strict-flag-off", "ts-config-unreadable"] as const) expect(GUARD_ACCEPTABLE).not.toContain(never);
  });
  it("uses only codes that exist", () => {
    for (const c of GUARD_ACCEPTABLE) expect(GUARD_CODES).toContain(c);
  });
  it("does not say more about the reasons than was read", () => {
    for (const a of GUARD_ACCEPTED) expect(a.reason).not.toMatch(/\b(verified|safe|secure|fixed)\b/i);
  });
});

describe("validateGuardRegister", () => {
  it("accepts a small valid register", () => expect(msgs(reg())).toEqual([]));
  it("finds configurations out of order", () => expect(msgs(reg({ tsFlags: { "b.json": "strict=true", "a.json": "strict=true" } }))).toEqual(["the configurations are not in sorted order"]));
  it("finds a configuration with no flags", () => expect(msgs(reg({ tsFlags: { "a.json": "" } }))).toEqual(["a.json has no flags"]));
  it("finds a suppression listed twice", () => {
    const r = { path: "a.ts", kind: "any", rules: "", count: 1 };
    expect(msgs(reg({ suppressions: [r, r] }))).toEqual(["a suppression is listed twice"]);
  });
  it("finds suppressions out of order", () => {
    expect(msgs(reg({ suppressions: [{ path: "b.ts", kind: "any", rules: "", count: 1 }, { path: "a.ts", kind: "any", rules: "", count: 1 }] }))).toEqual(["the suppressions are not in sorted order"]);
  });
  it.each([[0], [-2], [1.5]])("finds a suppression with a count of %d", (n) => expect(msgs(reg({ suppressions: [{ path: "a.ts", kind: "any", rules: "", count: n }] }))).toEqual([`a.ts any has a count of ${n}`]));
  it("finds a package file listed twice", () => expect(msgs(reg({ packages: ["a/package.json", "a/package.json"] }))).toEqual(["a package file is listed twice"]));
  it("accepts a valid accepted row", () => expect(msgs(reg(), [row])).toEqual([]));
  it("finds a row accepted twice", () => expect(msgs(reg(), [row, row])).toEqual(["a.ts accepts suppress-no-reason twice"]));
  it("finds a code that may not be accepted", () => expect(msgs(reg(), [{ ...row, code: "suppress-nocheck" }])).toEqual(["suppress-nocheck may not be accepted (a.ts)"]));
  it("finds a count that is not a whole number above 0", () => expect(msgs(reg(), [{ ...row, count: 0 }])).toEqual(["a.ts suppress-no-reason has a count of 0"]));
  it("finds a reason that is too short", () => expect(msgs(reg(), [{ ...row, reason: "ok" }])).toEqual(["a.ts suppress-no-reason has no real reason"]));
  it("gives every problem, not only the first", () => expect(msgs(reg({ tsFlags: { "a.json": "" }, packages: ["x", "x"] }), [{ ...row, count: 0, reason: "" }]).length).toBe(4));
});
