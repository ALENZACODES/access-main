import { describe, expect, it } from "vitest";
import type { Sink } from "./dgSink";
import { SINK_ROWS, compareSinks, formatSinkProblem } from "./dgSinkRegister";

const sink = (path: string): Sink => ({ path, line: 1, kind: "assign", value: "call", callee: "f" });
const row = (path: string, count: number) => ({ path, count, reason: "A reason that says what was read." });

describe("SINK_ROWS", () => {
  it("lists each file once", () => expect(new Set(SINK_ROWS.map((r) => r.path)).size).toBe(SINK_ROWS.length));
  it("is sorted by path", () => expect(SINK_ROWS.map((r) => r.path)).toEqual([...SINK_ROWS.map((r) => r.path)].sort()));
  it("gives every row a positive count and a reason", () => {
    for (const r of SINK_ROWS) {
      expect(r.count, r.path).toBeGreaterThan(0);
      expect(r.reason.length, r.path).toBeGreaterThan(30);
    }
  });
  it("names only files of the App", () => {
    for (const r of SINK_ROWS) expect(r.path.startsWith("apps/web/src/"), r.path).toBe(true);
  });
  it("says what was not checked wherever a reason claims no check", () => {
    for (const r of SINK_ROWS.filter((x) => /Not checked/.test(x.reason))) expect(r.reason, r.path).toMatch(/Not checked: .{10,}/);
  });
});

describe("compareSinks", () => {
  it("finds nothing when the rows match the writes", () => expect(compareSinks([sink("a"), sink("a"), sink("b")], [row("a", 2), row("b", 1)])).toEqual([]));
  it("finds a file that is not listed", () => expect(compareSinks([sink("a")], [])).toEqual([{ code: "sink-not-listed", path: "a", detail: "1 write(s) of markup, none listed" }]));
  it("finds a count that changed", () => expect(compareSinks([sink("a")], [row("a", 2)])[0]).toMatchObject({ code: "count-changed", detail: "listed 2, found 1" }));
  it("finds a listed file with no write left", () => expect(compareSinks([], [row("a", 1)])[0]).toMatchObject({ code: "listed-gone" }));
  it("finds a reason that says nothing", () => expect(compareSinks([sink("a")], [{ path: "a", count: 1, reason: "ok" }])[0]).toMatchObject({ code: "empty-reason" }));
  it("sorts its problems by path", () => expect(compareSinks([sink("b"), sink("a")], []).map((p) => p.path)).toEqual(["a", "b"]));
});

describe("formatSinkProblem", () => {
  it("writes the path, the code and the detail", () => expect(formatSinkProblem({ code: "listed-gone", path: "a", detail: "x" })).toBe("a: listed-gone: x"));
});
