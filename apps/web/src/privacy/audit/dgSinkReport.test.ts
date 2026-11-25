import { describe, expect, it } from "vitest";
import type { Sink } from "./dgSink";
import { renderSinkReport, tally } from "./dgSinkReport";

const sink = (path: string, kind: Sink["kind"], value: Sink["value"], callee = ""): Sink => ({ path, line: 1, kind, value, callee });

describe("tally", () => {
  it("counts and sorts by count, then by name", () => expect(tally(["b", "a", "b", "c", "a", "b"])).toEqual([["b", 3], ["a", 2], ["c", 1]]));
  it("breaks a tie by name", () => expect(tally(["z", "y"])).toEqual([["y", 1], ["z", 1]]));
  it("is empty for nothing", () => expect(tally([])).toEqual([]));
});

describe("renderSinkReport", () => {
  const input = {
    files: 7,
    sinks: [sink("a", "assign", "call", "renderA"), sink("a", "assign", "call", "renderB"), sink("b", "react-html", "none")],
    rows: [{ path: "a", count: 2, reason: "r" }],
    problems: [],
  };
  const text = renderSinkReport(input);
  it("gives the counts", () => {
    expect(text).toContain("Files read: 7");
    expect(text).toContain("Writes found: 3");
    expect(text).toContain("Files with a write: 2");
    expect(text).toContain("Rows on the list: 1");
  });
  it("lists the kinds, the values of assignments and the functions", () => {
    expect(text).toContain("- assign: 2");
    expect(text).toContain("- react-html: 1");
    expect(text).toContain("- call: 2");
    expect(text).toContain("- renderA: 1");
  });
  it("does not count the value of a write that is not an assignment", () => expect(text).not.toContain("- none: 1"));
  it("says none for a clean run", () => expect(text.match(/^none$/gm)).toHaveLength(1));
  it("says none four times for nothing at all", () => expect(renderSinkReport({ files: 0, sinks: [], rows: [], problems: [] }).match(/^none$/gm)).toHaveLength(4));
  it("writes a problem on its own line", () => {
    const t = renderSinkReport({ ...input, problems: [{ code: "listed-gone", path: "a", detail: "x" }] });
    expect(t).toContain("- a: listed-gone: x");
  });
  it("gives the same report twice", () => expect(renderSinkReport(input)).toBe(text));
});
