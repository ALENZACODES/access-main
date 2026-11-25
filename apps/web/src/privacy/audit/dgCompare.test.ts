import { describe, expect, it } from "vitest";
import { compareDg, formatDgProblem, formatDgProblems } from "./dgCompare";
import type { DgAcceptRow } from "./dgRegister";
import type { DgFinding } from "./dgRules";

const f = (code: DgFinding["code"], path = "apps/web/src/a.ts", line = 1): DgFinding => ({ code, path, line, detail: "d" });
const rows: DgAcceptRow[] = [{ path: "apps/web/src/a.ts", code: "dg-error-text", count: 2, reason: "A real reason that is long enough." }];

describe("compareDg", () => {
  it("has no difference when the findings are exactly the accepted ones", () => expect(compareDg([f("dg-error-text"), f("dg-error-text", undefined, 5)], rows)).toEqual([]));
  it("has no difference for nothing on both sides", () => expect(compareDg([], [])).toEqual([]));
  it("finds a finding that is not accepted, and says it in the plural", () => {
    expect(compareDg([f("dg-console")], [])).toEqual([{ code: "finding-not-accepted", key: "apps/web/src/a.ts dg-console", detail: "1 finding not on the accepted list" }]);
    expect(compareDg([f("dg-console"), f("dg-console")], [])[0]?.detail).toBe("2 findings not on the accepted list");
  });
  it("finds an accepted finding that is gone", () => expect(compareDg([], rows)).toEqual([{ code: "accepted-gone", key: "apps/web/src/a.ts dg-error-text", detail: "accepted ×2; none found" }]));
  it("finds a count that changed, up or down", () => {
    expect(compareDg([f("dg-error-text")], rows)).toEqual([{ code: "count-changed", key: "apps/web/src/a.ts dg-error-text", detail: "accepted ×2, found ×1" }]);
    expect(compareDg([f("dg-error-text"), f("dg-error-text"), f("dg-error-text")], rows)[0]?.detail).toBe("accepted ×2, found ×3");
  });
  it("finds a code that may not be accepted", () => expect(compareDg([f("dg-debugger")], [{ ...rows[0]!, code: "dg-debugger", count: 1 }]).map((p) => p.code)).toEqual(["unacceptable-code"]));
  it("does not take a finding in another file for the accepted one", () => expect(compareDg([f("dg-error-text", "apps/web/src/b.ts")], rows).map((p) => p.code).sort()).toEqual(["accepted-gone", "finding-not-accepted"]));
  it("gives the problems in key order", () => expect(compareDg([f("dg-console", "apps/web/src/z.ts"), f("dg-console", "apps/web/src/b.ts")], []).map((p) => p.key)).toEqual(["apps/web/src/b.ts dg-console", "apps/web/src/z.ts dg-console"]));
});

describe("formatting", () => {
  const p = { code: "count-changed", key: "k", detail: "d" } as const;
  it("writes a problem as one line", () => expect(formatDgProblem(p)).toBe("count-changed k: d"));
  it("writes problems one to a line, and none as nothing", () => {
    expect(formatDgProblems([p, p]).split("\n")).toHaveLength(2);
    expect(formatDgProblems([])).toBe("");
  });
});
