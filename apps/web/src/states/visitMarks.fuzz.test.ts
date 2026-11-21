import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { lcg, place, varied } from "./placeFixtures";
import {
  MAX_VISIT_MARKS, VISIT_STATUSES, clearVisitMark, keepMarksFor, marksForPlaces, parseVisitMarks, serializeVisitMarks, setVisitMark, summariseMarks, type VisitMark,
} from "./visitMarks";
import { marksToCode, parseMarksCode, planMarksImport } from "./marksTransfer";
import { marksToCsv, marksToText } from "./visitMarksExport";

const JUNK: unknown[] = [null, undefined, 0, -1, NaN, "", " ", "x", true, [], {}, [1], { id: 1 }, "\u0000", "=1+1", "9".repeat(300), { id: "a", status: "been", __proto__: { id: "p" } }];

function entry(r: () => number): unknown {
  if (r() < 0.2) return JUNK[Math.floor(r() * JUNK.length)];
  return {
    id: r() < 0.9 ? `id${Math.floor(r() * 30)}` : JUNK[Math.floor(r() * JUNK.length)],
    status: r() < 0.9 ? VISIT_STATUSES[Math.floor(r() * 3)] : JUNK[Math.floor(r() * JUNK.length)],
    markedOn: r() < 0.5 ? "2026-11-01" : JUNK[Math.floor(r() * JUNK.length)],
  };
}

describe("fuzz: marks", () => {
  it("parses 500 random stored values without throwing, with unique ids and valid fields", () => {
    const r = lcg(5);
    for (let n = 0; n < 500; n++) {
      const raw = Array.from({ length: Math.floor(r() * 40) }, () => entry(r));
      const out = parseVisitMarks(r() < 0.5 ? JSON.stringify(raw) : raw);
      expect(out.length).toBeLessThanOrEqual(MAX_VISIT_MARKS);
      expect(new Set(out.map((m) => m.id)).size).toBe(out.length);
      for (const m of out) {
        expect(VISIT_STATUSES).toContain(m.status);
        expect(m.markedOn === null || /^\d{4}-\d{2}-\d{2}$/.test(m.markedOn)).toBe(true);
      }
    }
  });
  it("round-trips whatever it parsed", () => {
    const r = lcg(6);
    for (let n = 0; n < 300; n++) {
      const once = parseVisitMarks(Array.from({ length: 20 }, () => entry(r)));
      expect(parseVisitMarks(serializeVisitMarks(once))).toEqual(once);
    }
  });
  it("keeps the list valid through 2,000 random changes", () => {
    const r = lcg(7);
    let marks: readonly VisitMark[] = [];
    for (let n = 0; n < 2000; n++) {
      const id = `id${Math.floor(r() * 40)}`;
      const k = r();
      if (k < 0.6) marks = setVisitMark(marks, id, VISIT_STATUSES[Math.floor(r() * 3)]!, "2026-11-21").marks;
      else if (k < 0.85) marks = clearVisitMark(marks, id);
      else marks = keepMarksFor(marks, new Set(Array.from({ length: 20 }, (_, i) => `id${i * 2}`)));
      expect(new Set(marks.map((m) => m.id)).size).toBe(marks.length);
      expect(marks.length).toBeLessThanOrEqual(MAX_VISIT_MARKS);
    }
  });
  it("summaries add up: counts and unmarked equal the listed places, plus the marks elsewhere equal the rest", () => {
    const r = lcg(8);
    for (let n = 0; n < 300; n++) {
      const marks = parseVisitMarks(Array.from({ length: 15 }, () => entry(r)));
      const listed = Array.from(new Set(Array.from({ length: Math.floor(r() * 12) }, () => `id${Math.floor(r() * 30)}`)));
      const s = summariseMarks(marks, listed);
      expect(s.counts["to-visit"] + s.counts.been + s.counts["ruled-out"] + s.unmarked).toBe(listed.length);
      expect(s.counts["to-visit"] + s.counts.been + s.counts["ruled-out"] + s.elsewhere).toBe(marks.length);
    }
  });
  it("makes text and CSV for awkward places without throwing, and the CSV reads back", () => {
    const r = lcg(9);
    for (let n = 0; n < 100; n++) {
      const places = [...varied(n, 8), place("z", { name: "Z" })];
      const marks = places.flatMap((p) => (r() < 0.5 ? [{ id: p.id, status: VISIT_STATUSES[Math.floor(r() * 3)]!, markedOn: r() < 0.5 ? "2026-11-01" : null }] : []));
      const rows = marksForPlaces(marks, places);
      expect(rows.map((x) => x.place.id)).toEqual(places.map((p) => p.id));
      for (const l of ["en", "fr"] as const) expect(marksToText(rows, "2026-11-21", l).endsWith("\n")).toBe(true);
      const parsed = parseCsv(marksToCsv(rows));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.rows).toHaveLength(places.length + 1);
    }
  });
  it("reads back every code it writes, whatever the names are", () => {
    const r = lcg(10);
    for (let n = 0; n < 200; n++) {
      const ps = varied(n, 10);
      const marks = ps.map((p) => ({ id: p.id, status: VISIT_STATUSES[Math.floor(r() * 3)]!, name: p.name }));
      const parsed = parseMarksCode(marksToCode(marks));
      expect(parsed.marks).toEqual(marks.map((x) => ({ id: x.id, status: x.status })));
      expect(parsed.ignored).toBe(0);
    }
  });
  it("never throws on random text and always covers every parsed mark once in the plan", () => {
    const r = lcg(12);
    const bits = ["MARKS v1", "- a | been", "- b | to-visit | B", "- | been", "1. c | ruled-out", "junk", "- a | BEEN", "", "- d | been | D | extra", "\u0000", "- bad id | been"];
    for (let n = 0; n < 400; n++) {
      const text = Array.from({ length: Math.floor(r() * 14) }, () => bits[Math.floor(r() * bits.length)]).join(r() < 0.5 ? "\n" : "\r\n");
      const parsed = parseMarksCode(text);
      const current = parseVisitMarks([{ id: "a", status: "been" }, { id: "c", status: "to-visit" }]);
      const plan = planMarksImport(parsed, current, new Set(["a", "b", "c"]));
      expect(plan.toSet.length + plan.same.length + plan.notInPack.length + plan.overCapacity.length).toBe(parsed.marks.length);
    }
  });
});
