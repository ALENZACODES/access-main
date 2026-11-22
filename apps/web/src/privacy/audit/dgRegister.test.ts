import { describe, expect, it } from "vitest";
import { DG_ACCEPTABLE, DG_ACCEPTED, assertDgRegister, validateDgRegister, type DgAcceptRow } from "./dgRegister";
import { DG_CODES } from "./dgRules";

const row: DgAcceptRow = { path: "apps/web/src/a.ts", code: "dg-error-text", count: 1, reason: "A real reason that is long enough to count." };
const msgs = (a: readonly DgAcceptRow[]): string[] => validateDgRegister(a).map((p) => p.message);

describe("the real accepted list", () => {
  it("is well formed", () => expect(validateDgRegister()).toEqual([]));
  it("does not throw when asserted", () => expect(() => assertDgRegister()).not.toThrow());
  it("accepts only codes that may be accepted", () => {
    for (const a of DG_ACCEPTED) expect(DG_ACCEPTABLE).toContain(a.code);
  });
  it("never allows a debugger statement, a browser dialog or the stack of an error", () => {
    for (const never of ["dg-debugger", "dg-dialog", "dg-error-stack"] as const) expect(DG_ACCEPTABLE).not.toContain(never);
  });
  it("uses only codes that exist", () => {
    for (const c of DG_ACCEPTABLE) expect(DG_CODES).toContain(c);
  });
  it("gives a reason of real length to every row", () => {
    for (const a of DG_ACCEPTED) expect(a.reason.length, a.path).toBeGreaterThan(40);
  });
  it("says what was not checked, where an error text is shown", () => {
    for (const a of DG_ACCEPTED.filter((x) => x.code === "dg-error-text" && x.path.includes("narrow/"))) expect(a.reason).toContain("Not checked");
  });
  it("does not say more in a reason than was read", () => {
    for (const a of DG_ACCEPTED) expect(a.reason).not.toMatch(/\b(verified|safe|secure|private|anonymous)\b/i);
  });
  it("lists only files under apps/web/src", () => {
    for (const a of DG_ACCEPTED) expect(a.path.startsWith("apps/web/src/")).toBe(true);
  });
});

describe("validateDgRegister", () => {
  it("accepts a small valid list, and an empty one", () => {
    expect(msgs([row])).toEqual([]);
    expect(msgs([])).toEqual([]);
  });
  it("finds a row accepted twice", () => expect(msgs([row, row])).toEqual(["apps/web/src/a.ts dg-error-text is accepted twice"]));
  it("finds rows out of order", () => expect(msgs([{ ...row, path: "apps/web/src/b.ts" }, row])).toEqual(["the accepted rows are not in sorted order"]));
  it("finds a code that may not be accepted", () => expect(msgs([{ ...row, code: "dg-debugger" }])).toEqual(["dg-debugger may not be accepted (apps/web/src/a.ts)"]));
  it.each([[0], [-1], [2.5]])("finds a count of %d", (n) => expect(msgs([{ ...row, count: n }])).toEqual([`apps/web/src/a.ts dg-error-text has a count of ${n}`]));
  it("finds a reason that is too short", () => expect(msgs([{ ...row, reason: "ok" }])).toEqual(["apps/web/src/a.ts dg-error-text has no real reason"]));
  it("finds a path outside apps/web/src", () => expect(msgs([{ ...row, path: "packages/x/a.ts" }])).toEqual(["packages/x/a.ts is not under apps/web/src"]));
  it("gives every problem, not only the first", () => expect(msgs([{ ...row, code: "dg-debugger", count: 0, reason: "" }]).length).toBe(3));
});
