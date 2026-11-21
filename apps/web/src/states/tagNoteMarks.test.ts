import { describe, expect, it } from "vitest";
import { markPieces } from "./tagNoteMarks";
import { scanSignals } from "./tagNoteSignals";

const notes = ["Two steps at the front, ramp at the side.", "No ramp. Stairs only.", "Open daily.", "", "Entrée de plain pied, sans marches.", "Wide doors and step free access!"];

describe("markPieces", () => {
  it("joins back to exactly the note", () => {
    for (const n of notes) expect(markPieces(n, scanSignals(n)).map((p) => p.text).join("")).toBe(n);
  });
  it("sets apart one piece for each signal", () => {
    const n = "Two steps at the front, ramp at the side.";
    expect(markPieces(n, scanSignals(n)).filter((p) => p.signal !== null).map((p) => p.text)).toEqual(["steps", "ramp"]);
  });
  it("has one plain piece for a note with no signals, and none for an empty note", () => {
    expect(markPieces("Open daily.", [])).toEqual([{ text: "Open daily.", signal: null }]);
    expect(markPieces("", [])).toEqual([]);
  });
  it("skips a signal that overlaps an earlier one or runs past the note", () => {
    const n = "Step free entrance";
    const [s] = scanSignals(n);
    const out = markPieces(n, [s!, { ...s!, start: 2, end: 9 }, { ...s!, start: 0, end: 999 }]);
    expect(out.map((p) => p.text).join("")).toBe(n);
    expect(out.filter((p) => p.signal !== null)).toHaveLength(1);
  });
  it("keeps the case and accents as written", () => {
    const n = "Entrée DE Plain Pied";
    expect(markPieces(n, scanSignals(n)).find((p) => p.signal)!.text).toBe("DE Plain Pied");
  });
});
