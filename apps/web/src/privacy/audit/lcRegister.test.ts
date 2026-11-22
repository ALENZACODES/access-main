import { describe, expect, it } from "vitest";
import { LC_ACCEPTED } from "./lcRegister";
import { validateLcRows } from "./lcRules";

describe("the accepted list", () => {
  it("is well formed", () => expect(validateLcRows(LC_ACCEPTED)).toEqual([]));
  it("has a reason of real length on every row", () => {
    for (const r of LC_ACCEPTED) expect(r.reason.length, r.path).toBeGreaterThan(60);
  });
  it("says what was not checked where the row speaks of a caller or a library", () => {
    for (const r of LC_ACCEPTED.filter((x) => /caller|library|exported/.test(x.reason))) expect(r.reason, r.path).toContain("Not checked");
  });
  it("is in the folders where the writes are", () => {
    for (const r of LC_ACCEPTED) expect(r.path.startsWith("apps/web/src/"), r.path).toBe(true);
  });
});
