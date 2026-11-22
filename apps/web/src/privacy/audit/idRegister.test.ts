import { describe, expect, it } from "vitest";
import { ID_ACCEPTED, acceptedCount, assertIdRegister, sumAccepted, validateIdRegister } from "./idRegister";
import type { IdAcceptRow } from "./idRegister";

const row = (over: Partial<IdAcceptRow> = {}): IdAcceptRow => ({ path: "apps/web/src/a.ts", code: "id-uuid", count: 1, reason: "A reason that says what was read in the lines.", ...over });

describe("ID_ACCEPTED", () => {
  it("is valid", () => expect(validateIdRegister()).toEqual([]));
  it("does not throw when asserted", () => expect(() => assertIdRegister()).not.toThrow());
  it("never holds a high device read or Math.random on a line that moves data", () => {
    for (const r of ID_ACCEPTED) expect(["id-device-high", "id-math-random-moves"], r.path).not.toContain(r.code);
  });
  it("says what was not checked wherever a reason names a check", () => {
    for (const r of ID_ACCEPTED.filter((x) => /Not checked/.test(x.reason))) expect(r.reason, r.path).toMatch(/Not checked: .{10,}/);
  });
});

describe("validateIdRegister", () => {
  it("finds a duplicate row", () => expect(validateIdRegister([row(), row()]).map((p) => p.code)).toEqual(["duplicate-row"]));
  it("finds a code that may never be accepted", () => expect(validateIdRegister([row({ code: "id-device-high" })]).map((p) => p.code)).toEqual(["unacceptable-code"]));
  it("finds a count that is not a positive whole number", () => {
    expect(validateIdRegister([row({ count: 0 })]).map((p) => p.code)).toEqual(["bad-count"]);
    expect(validateIdRegister([row({ count: 1.5 })]).map((p) => p.code)).toEqual(["bad-count"]);
  });
  it("finds a reason that is too short", () => expect(validateIdRegister([row({ reason: "fine" })]).map((p) => p.code)).toEqual(["empty-reason"]));
  it("finds a path outside the code of the App", () => expect(validateIdRegister([row({ path: "packages/a.ts" })]).map((p) => p.code)).toEqual(["outside-src"]));
  it("finds rows that are not sorted", () => expect(validateIdRegister([row({ path: "apps/web/src/b.ts" }), row({ path: "apps/web/src/a.ts" })]).map((p) => p.code)).toEqual(["unsorted"]));
  it("sorts the same path by code", () => expect(validateIdRegister([row({ code: "id-math-random" }), row({ code: "id-uuid" })])).toEqual([]));
  it("says nothing for no rows", () => expect(validateIdRegister([])).toEqual([]));
});

describe("assertIdRegister", () => {
  it("throws with the path and the code", () => expect(() => assertIdRegister([row({ reason: "" })])).toThrow(/apps\/web\/src\/a\.ts empty-reason id-uuid/));
});

describe("acceptedCount and sumAccepted", () => {
  const rows = [row({ count: 3 })];
  it("gives the count of a row, or zero", () => {
    expect(acceptedCount("apps/web/src/a.ts", "id-uuid", rows)).toBe(3);
    expect(acceptedCount("apps/web/src/a.ts", "id-math-random", rows)).toBe(0);
    expect(acceptedCount("apps/web/src/z.ts", "id-uuid", rows)).toBe(0);
  });
  it("counts the findings that have a row", () => {
    const f = [
      { path: "apps/web/src/a.ts", line: 1, code: "id-uuid", detail: "x" },
      { path: "apps/web/src/q.ts", line: 1, code: "id-uuid", detail: "x" },
    ] as const;
    expect(sumAccepted(f, rows)).toBe(1);
  });
});
