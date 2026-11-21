import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { MAX_CODE_CHARS, MAX_CODE_LINES } from "./listTransfer";
import { MARKS_CODE_HEADER, marksImportSummary, marksToCode, parseMarksCode, plannedLine, planMarksImport, type MarksPlan } from "./marksTransfer";
import { lintFrench } from "./typography";
import { MAX_VISIT_MARKS, type VisitMark } from "./visitMarks";

const m = (id: string, status: VisitMark["status"] = "to-visit"): VisitMark => ({ id, status, markedOn: "2026-11-01" });
const pack = (...ids: string[]) => new Set(ids);

describe("marksToCode", () => {
  it("starts with the header and has one line per mark", () => {
    expect(marksToCode([{ id: "a", status: "been", name: "Alpha Hall" }, { id: "b", status: "ruled-out", name: null }])).toBe(`${MARKS_CODE_HEADER}\n- a | been | Alpha Hall\n- b | ruled-out | UNKNOWN\n`);
  });
  it("is the header alone for no marks", () => {
    expect(marksToCode([])).toBe("MARKS v1\n");
  });
  it("cleans a name so it cannot break the line", () => {
    const code = marksToCode([{ id: "a", status: "been", name: "Tom | Jerry\nand‮the  rest\u0000" }]);
    expect(code.split("\n")).toHaveLength(3);
    expect(code).toContain("Tom / Jerry and the rest");
    expect([...code].some((c) => c.charCodeAt(0) === 0 || c.charCodeAt(0) === 0x202e)).toBe(false);
  });
  it("leaves out a mark with an unusable id or status", () => {
    const code = marksToCode([{ id: "bad id", status: "been", name: "x" }, { id: "a", status: "nope" as never, name: "x" }, { id: "ok", status: "been", name: "x" }]);
    expect(code).toBe("MARKS v1\n- ok | been | x\n");
  });
  it("holds no day, so nothing about when the person marked", () => {
    expect(marksToCode([{ id: "a", status: "been", name: "A" }])).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("parseMarksCode", () => {
  it("reads what marksToCode writes", () => {
    const code = marksToCode([{ id: "a", status: "been", name: "A" }, { id: "b", status: "to-visit", name: "B" }]);
    const p = parseMarksCode(code);
    expect(p.marks).toEqual([{ id: "a", status: "been" }, { id: "b", status: "to-visit" }]);
    expect(p).toMatchObject({ ignored: 0, hadHeader: true, cut: false });
  });
  it("accepts bullets, numbers and a missing name", () => {
    const p = parseMarksCode("1. a | been\n2) b | to-visit |\n• c | ruled-out | C\n* d | been | D");
    expect(p.marks.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(p.hadHeader).toBe(false);
  });
  it("accepts Windows and old Mac line ends", () => {
    expect(parseMarksCode("MARKS v1\r\n- a | been | A\r- b | been | B").marks).toHaveLength(2);
  });
  it("keeps the first line of a repeated id", () => {
    expect(parseMarksCode("- a | been\n- a | ruled-out").marks).toEqual([{ id: "a", status: "been" }]);
  });
  it("counts lines it does not understand", () => {
    const p = parseMarksCode("MARKS v1\nhello\n- a | wrong | A\n- bad id | been\n- | been\n- a | been | A");
    expect(p.marks).toEqual([{ id: "a", status: "been" }]);
    expect(p.ignored).toBe(4);
  });
  it("does not take a status from the name column", () => {
    expect(parseMarksCode("- a | | been").marks).toEqual([]);
  });
  it("ignores blank lines and gives nothing for empty text", () => {
    expect(parseMarksCode("")).toEqual({ marks: [], ignored: 0, hadHeader: false, cut: false });
    expect(parseMarksCode("\n\n  \n").ignored).toBe(0);
  });
  it("cuts a very long text and says so", () => {
    const long = `MARKS v1\n${"- a | been | x\n".repeat(MAX_CODE_CHARS)}`;
    expect(parseMarksCode(long).cut).toBe(true);
  });
  it("cuts a text with too many lines", () => {
    const lines = Array.from({ length: MAX_CODE_LINES + 20 }, (_, i) => `- p${i} | been`).join("\n");
    const p = parseMarksCode(lines);
    expect(p.cut).toBe(true);
    expect(p.marks.length).toBeLessThanOrEqual(MAX_CODE_LINES);
  });
  it("does not read a case variant of a status", () => {
    expect(parseMarksCode("- a | BEEN").marks).toEqual([]);
  });
});

describe("planMarksImport", () => {
  const parsed = (text: string) => parseMarksCode(text);
  it("sets marks for places the pack holds that have no mark", () => {
    const plan = planMarksImport(parsed("- a | been\n- b | to-visit"), [], pack("a", "b"));
    expect(plan.toSet).toEqual([{ id: "a", status: "been", replaces: null }, { id: "b", status: "to-visit", replaces: null }]);
  });
  it("sets a different mark and says what it replaces", () => {
    const plan = planMarksImport(parsed("- a | ruled-out"), [m("a", "been")], pack("a"));
    expect(plan.toSet).toEqual([{ id: "a", status: "ruled-out", replaces: "been" }]);
  });
  it("leaves the same mark alone", () => {
    const plan = planMarksImport(parsed("- a | been"), [m("a", "been")], pack("a"));
    expect(plan.same).toEqual(["a"]);
    expect(plan.toSet).toEqual([]);
  });
  it("leaves out places the pack does not hold, even when the mark is the same", () => {
    const plan = planMarksImport(parsed("- gone | been"), [m("gone", "been")], pack("a"));
    expect(plan.notInPack).toEqual(["gone"]);
    expect(plan.same).toEqual([]);
  });
  it("leaves out new marks past the limit but still changes existing ones", () => {
    const current = Array.from({ length: MAX_VISIT_MARKS }, (_, i) => m(`p${i}`, "been"));
    const ids = ["new", "p1"];
    const plan = planMarksImport(parsed("- new | been\n- p1 | ruled-out"), current, pack(...ids, ...current.map((c) => c.id)));
    expect(plan.overCapacity).toEqual(["new"]);
    expect(plan.toSet).toEqual([{ id: "p1", status: "ruled-out", replaces: "been" }]);
  });
  it("uses the room left and takes the first marks of the code that fit", () => {
    const current = Array.from({ length: MAX_VISIT_MARKS - 1 }, (_, i) => m(`p${i}`));
    const plan = planMarksImport(parsed("- x | been\n- y | been"), current, pack("x", "y"));
    expect(plan.toSet.map((s) => s.id)).toEqual(["x"]);
    expect(plan.overCapacity).toEqual(["y"]);
  });
  it("keeps the order of the code", () => {
    const plan = planMarksImport(parsed("- c | been\n- a | been\n- b | been"), [], pack("a", "b", "c"));
    expect(plan.toSet.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
  it("does not change what it is given", () => {
    const current = [m("a", "been")];
    const copy = JSON.stringify(current);
    planMarksImport(parsed("- a | ruled-out"), current, pack("a"));
    expect(JSON.stringify(current)).toBe(copy);
  });
  it("covers every line of the code exactly once", () => {
    const p = parsed("- a | been\n- b | been\n- c | to-visit\n- d | been\n- e | been");
    const plan = planMarksImport(p, [m("b", "been"), m("c", "been")], pack("a", "b", "c", "e"), MAX_VISIT_MARKS);
    expect(plan.toSet.length + plan.same.length + plan.notInPack.length + plan.overCapacity.length).toBe(p.marks.length);
  });
});

describe("marksImportSummary", () => {
  const empty: MarksPlan = { toSet: [], same: [], notInPack: [], overCapacity: [] };
  it("says how to write a code when none is found", () => {
    expect(marksImportSummary(empty, parseMarksCode("hello"), "en")).toBe("No marks found in this text. A marks code starts with MARKS v1 and has one line for each mark.");
    expect(marksImportSummary(empty, parseMarksCode("hello"), "fr")).toContain("Aucune marque trouvée");
  });
  it("counts what would be set, replaced, the same, missing, too many and not understood", () => {
    const plan: MarksPlan = {
      toSet: [{ id: "a", status: "been", replaces: null }, { id: "b", status: "been", replaces: "to-visit" }],
      same: ["c"], notInPack: ["d", "e"], overCapacity: ["f"],
    };
    const p = parseMarksCode("- a | been\n- b | been\n- c | been\n- d | been\n- e | been\n- f | been\nnope");
    expect(marksImportSummary(plan, p, "en")).toBe(
      "2 marks would be set. 1 replaces a mark you already have. 1 is already the same. 2 are on a place that is not in the pack on this device. 1 does not fit: at most 200 marks are kept. 1 line was not understood and left out.",
    );
  });
  it("has the singular and plural right in French", () => {
    const one: MarksPlan = { toSet: [{ id: "a", status: "been", replaces: null }], same: [], notInPack: [], overCapacity: [] };
    expect(marksImportSummary(one, parseMarksCode("- a | been"), "fr")).toBe("1 marque serait appliquée.");
    const two: MarksPlan = { toSet: [{ id: "a", status: "been", replaces: null }, { id: "b", status: "been", replaces: null }], same: [], notInPack: [], overCapacity: [] };
    expect(marksImportSummary(two, parseMarksCode("- a | been\n- b | been"), "fr")).toBe("2 marques seraient appliquées.");
  });
  it("says when the text was cut", () => {
    const cut = parseMarksCode(`- a | been\n${"x".repeat(MAX_CODE_CHARS)}`);
    expect(marksImportSummary({ ...empty, toSet: [{ id: "a", status: "been", replaces: null }] }, cut, "en")).toContain("only the start was read");
  });
  it("is clean in both languages for every combination", () => {
    const plan: MarksPlan = { toSet: [{ id: "a", status: "been", replaces: "to-visit" }], same: ["c"], notInPack: ["d"], overCapacity: ["f"] };
    const p = { ...parseMarksCode("- a | been\nnope"), cut: true };
    for (const l of ["en", "fr"] as const) {
      const s = marksImportSummary(plan, p, l);
      expect(lintCopy(s, l), s).toEqual([]);
      if (l === "fr") expect(lintFrench(s), s).toEqual([]);
    }
  });
});

describe("plannedLine", () => {
  it("names the place and the mark, and what it replaces", () => {
    expect(plannedLine("Alpha Hall", "been", null, "en")).toBe("Alpha Hall\u00a0: Been there");
    expect(plannedLine("Alpha Hall", "been", "to-visit", "en")).toBe("Alpha Hall: Been there (was To visit)");
    expect(plannedLine("Alpha Hall", "been", "to-visit", "fr")).toBe("Alpha Hall\u00a0: Déjà allé (était À visiter)");
  });
});
