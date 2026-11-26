import { describe, expect, it } from "vitest";
import { compareIds, formatIdProblem, formatIdProblems } from "./idCompare";
import type { IdAcceptRow } from "./idRegister";
import type { IdFinding } from "./idRules";

const f = (path: string, line: number, code: IdFinding["code"] = "id-uuid"): IdFinding => ({ path, line, code, detail: "d" });
const r = (path: string, count: number, code: IdAcceptRow["code"] = "id-uuid"): IdAcceptRow => ({ path, code, count, reason: "A reason that says what was read." });

describe("compareIds", () => {
  it("finds nothing when findings and rows agree", () => expect(compareIds([f("a", 1), f("a", 5), f("b", 2)], [r("a", 2), r("b", 1)])).toEqual([]));
  it("finds a finding with no row, with its lines", () => expect(compareIds([f("a", 1), f("a", 5)], [])).toEqual([{ code: "finding-not-accepted", path: "a", idCode: "id-uuid", detail: "2 at line 1, 5" }]));
  it("finds a count that changed", () => expect(compareIds([f("a", 1)], [r("a", 2)])).toEqual([{ code: "count-changed", path: "a", idCode: "id-uuid", detail: "accepted 2, found 1" }]));
  it("finds a row with no finding", () => expect(compareIds([], [r("a", 1)])).toEqual([{ code: "accepted-gone", path: "a", idCode: "id-uuid", detail: "accepted 1, found none" }]));
  it("keeps the code apart: a row for one code does not cover another", () => expect(compareIds([f("a", 1, "id-math-random")], [r("a", 1)]).map((p) => p.code).sort()).toEqual(["accepted-gone", "finding-not-accepted"]));
  it("never accepts a high device read, even with a row", () => {
    const p = compareIds([f("a", 3, "id-device-high")], [r("a", 1, "id-device-high")]);
    expect(p).toEqual([{ code: "unacceptable-code", path: "a", idCode: "id-device-high", detail: "id-device-high at line 3 may never be accepted" }]);
  });
  it("never accepts Math.random on a line that moves data", () => expect(compareIds([f("a", 3, "id-math-random-moves")], []).map((p) => p.code)).toEqual(["unacceptable-code"]));
  it("sorts the problems by path", () => expect(compareIds([f("b", 1), f("a", 1)], []).map((p) => p.path)).toEqual(["a", "b"]));
});

describe("formatIdProblem", () => {
  const p = { code: "count-changed", path: "a.ts", idCode: "id-uuid", detail: "accepted 2, found 1" } as const;
  it("writes the path, the problem, the code and the detail", () => expect(formatIdProblem(p)).toBe("a.ts: count-changed: id-uuid: accepted 2, found 1"));
  it("writes a list", () => expect(formatIdProblems([p, p])).toHaveLength(2));
  it("writes an empty list", () => expect(formatIdProblems([])).toEqual([]));
});
