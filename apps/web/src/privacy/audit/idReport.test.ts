import { describe, expect, it } from "vitest";
import { renderIdReport } from "./idReport";

const finding = (path: string, code: "id-uuid" | "id-math-random" = "id-uuid") => ({ path, line: 1, code, detail: "d" });

describe("renderIdReport", () => {
  const input = {
    files: 12,
    findings: [finding("b"), finding("a"), finding("a", "id-math-random")],
    accepted: [{ path: "a", code: "id-uuid" as const, count: 1, reason: "A reason that says what was read." }],
    problems: [],
  };
  const text = renderIdReport(input);
  it("gives the counts", () => {
    expect(text).toContain("Files read: 12");
    expect(text).toContain("Findings: 3");
    expect(text).toContain("Accepted rows: 1");
  });
  it("lists every code, with zero for none", () => {
    expect(text).toContain("- id-uuid: 2");
    expect(text).toContain("- id-math-random: 1");
    expect(text).toContain("- id-device-high: 0");
    expect(text).toContain("- id-math-random-moves: 0");
  });
  it("lists the files by count and then by name", () => expect(text.indexOf("- a: 2")).toBeLessThan(text.indexOf("- b: 1")));
  it("says none when there are no problems", () => expect(text.match(/^none$/gm)).toHaveLength(1));
  it("says none for the files and the problems when there is nothing", () => expect(renderIdReport({ files: 0, findings: [], accepted: [], problems: [] }).match(/^none$/gm)).toHaveLength(2));
  it("writes a problem", () => {
    const t = renderIdReport({ ...input, problems: [{ code: "accepted-gone", path: "z", idCode: "id-uuid", detail: "x" }] });
    expect(t).toContain("- z: accepted-gone: id-uuid: x");
  });
  it("gives the same report twice", () => expect(renderIdReport(input)).toBe(text));
});
