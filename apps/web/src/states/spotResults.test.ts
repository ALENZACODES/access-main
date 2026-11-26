import { describe, expect, it } from "vitest";
import { place, varied } from "./placeFixtures";
import { MAX_RESULT_NOTES, MAX_RESULT_ROWS, foldAnswer, readAnswer, readSpotResults } from "./spotResults";
import { sampleForSpotCheck } from "./spotSample";
import { buildSpotSheet } from "./spotSheet";
import { SPOT_CSV_HEADER, spotSheetToCsv } from "./spotSheetExport";
import { csvCell } from "./exportData";

const HEAD = SPOT_CSV_HEADER.join(",");
const line = (cells: Partial<Record<(typeof SPOT_CSV_HEADER)[number], string>>): string => SPOT_CSV_HEADER.map((h) => csvCell(cells[h] ?? "")).join(",");
const csv = (...rows: string[]) => [HEAD, ...rows].join("\r\n") + "\r\n";
const base = { n: "1", place_id: "p1", place_name: "Café Un", pack_tag: "yes", pack_source: "OpenStreetMap", pack_retrieved_on: "2026-11-10" };

function rows(text: string) {
  const r = readSpotResults(text);
  if (!r.ok) throw new Error(r.problem);
  return r;
}

describe("foldAnswer", () => {
  it("folds case, accents and spaces", () => {
    expect(foldAnswer("  Différent ")).toBe("different");
    expect(foldAnswer("Pas   certain")).toBe("pas certain");
    expect(foldAnswer("IMPOSSIBLE À DIRE")).toBe("impossible a dire");
    expect(foldAnswer("")).toBe("");
  });
});

describe("readAnswer", () => {
  it.each([
    ["step", "Yes", "yes"], ["step", "yes", "yes"], ["door", "NO", "no"], ["ramp", "oui", "yes"], ["level", "Non", "no"], ["step", "y", "yes"], ["step", "n", "no"],
    ["step", "Not sure", "not-sure"], ["step", "not-sure", "not-sure"], ["door", "Pas certain", "not-sure"], ["step", "unsure", "not-sure"],
    ["match", "Same", "same"], ["match", "pareil", "same"], ["match", "Identique", "same"], ["match", "Different", "different"], ["match", "Différent", "different"],
    ["match", "Could not tell", "could-not-tell"], ["match", "impossible à dire", "could-not-tell"],
  ] as const)("reads %s answer %j as %s", (key, cell, expected) => {
    expect(readAnswer(key, cell)).toBe(expected);
  });
  it("reads a blank cell as no answer", () => {
    expect(readAnswer("step", "")).toBeNull();
    expect(readAnswer("match", "   ")).toBeNull();
  });
  it("does not understand an answer that belongs to another question", () => {
    expect(readAnswer("step", "Same")).toBeUndefined();
    expect(readAnswer("match", "Yes")).toBeUndefined();
    expect(readAnswer("match", "No")).toBeUndefined();
    expect(readAnswer("ramp", "Different")).toBeUndefined();
  });
  it("does not guess at words it does not know", () => {
    for (const w of ["maybe", "ya", "yes!", "1", "true", "x", "oui non"]) expect(readAnswer("step", w), w).toBeUndefined();
  });
});

describe("readSpotResults: refusals", () => {
  it.each([
    ["", "empty"],
    ["  \n ", "empty"],
    ["a,b\r\n1,2\r\n", "wrong-header"],
    [HEAD.replace("place_id", "id") + "\r\n1\r\n", "wrong-header"],
    [HEAD + ",extra\r\n", "wrong-header"],
    [`${HEAD}\r\n`, "no-rows"],
    [`"${HEAD}\r\n`, "not-csv"],
  ])("refuses %j as %s", (text, problem) => {
    expect(readSpotResults(text)).toEqual({ ok: false, problem });
  });
  it("refuses a CSV that is only rows with no place id", () => {
    expect(readSpotResults(csv(line({ n: "1" }), line({ n: "2" })))).toEqual({ ok: false, problem: "no-rows" });
  });
  it("refuses more rows than a sheet holds", () => {
    const many = csv(...Array.from({ length: MAX_RESULT_ROWS + 1 }, (_, i) => line({ ...base, place_id: `p${i}` })));
    expect(readSpotResults(many)).toEqual({ ok: false, problem: "too-many-rows" });
  });
  it("accepts exactly the limit", () => {
    const ok = csv(...Array.from({ length: MAX_RESULT_ROWS }, (_, i) => line({ ...base, place_id: `p${i}` })));
    expect(rows(ok).rows).toHaveLength(MAX_RESULT_ROWS);
  });
  it("refuses text that is too large", () => {
    expect(readSpotResults("x".repeat(5_000_100))).toEqual({ ok: false, problem: "too-large" });
  });
});

describe("readSpotResults: reading", () => {
  it("reads the sheet's own CSV, with a byte order mark and Windows line ends", () => {
    const places = varied(3, 20);
    const sheet = buildSpotSheet(sampleForSpotCheck(places, { size: 5, seed: "r", balanced: true }), "r", true, "en", "2026-11-21");
    const r = rows(spotSheetToCsv(sheet, { bom: true }));
    expect(r.rows).toHaveLength(5);
    expect(r.rows.map((x) => x.id)).toEqual(sheet.entries.map((e) => e.id));
    expect(r.rows.every((x) => Object.keys(x.answers).length === 0 && x.problems.length === 0)).toBe(true);
    expect(r.skipped).toBe(0);
  });
  it("reads the pack's side of each row as written on the sheet", () => {
    const [x] = rows(csv(line({ ...base, pack_tag: "limited" }))).rows;
    expect(x).toMatchObject({ n: "1", id: "p1", name: "Café Un", tag: "limited", source: "OpenStreetMap", retrievedOn: "2026-11-10" });
  });
  it("reads every answer, the date and the notes", () => {
    const [x] = rows(csv(line({ ...base, step: "No", door: "Yes", ramp: "Not sure", level: "yes", match: "Different", date_looked: "2026-11-22", notes: "Ramp is at the back" }))).rows;
    expect(x!.answers).toEqual({ step: "no", door: "yes", ramp: "not-sure", level: "yes", match: "different" });
    expect(x!.dateLooked).toBe("2026-11-22");
    expect(x!.notes).toBe("Ramp is at the back");
    expect(x!.problems).toEqual([]);
  });
  it("reads French answers", () => {
    const [x] = rows(csv(line({ ...base, step: "Oui", door: "Non", ramp: "Pas certain", match: "Pareil" }))).rows;
    expect(x!.answers).toEqual({ step: "yes", door: "no", ramp: "not-sure", match: "same" });
  });
  it("leaves a blank answer out rather than filling it in", () => {
    const [x] = rows(csv(line({ ...base, step: "Yes" }))).rows;
    expect(Object.keys(x!.answers)).toEqual(["step"]);
  });
  it("reports an answer it does not understand, by column, and keeps the rest", () => {
    const [x] = rows(csv(line({ ...base, step: "maybe", door: "Yes" }))).rows;
    expect(x!.problems).toEqual([{ column: "step", problem: "answer-not-understood" }]);
    expect(x!.answers).toEqual({ door: "yes" });
  });
  it("reports a date it does not understand and leaves it null", () => {
    const [x] = rows(csv(line({ ...base, date_looked: "last Tuesday" }))).rows;
    expect(x!.dateLooked).toBeNull();
    expect(x!.problems).toEqual([{ column: "date_looked", problem: "date-not-understood" }]);
    expect(rows(csv(line({ ...base, date_looked: "2026-02-30" }))).rows[0]!.problems).toHaveLength(1);
  });
  it("leaves a blank date alone without a problem", () => {
    const [x] = rows(csv(line(base))).rows;
    expect(x!.dateLooked).toBeNull();
    expect(x!.problems).toEqual([]);
  });
  it("writes UNKNOWN for a pack side that is blank", () => {
    const [x] = rows(csv(line({ place_id: "z" }))).rows;
    expect(x).toMatchObject({ name: "UNKNOWN", tag: "UNKNOWN", source: "UNKNOWN", retrievedOn: "UNKNOWN" });
  });
  it("leaves out rows with no place id, and counts them", () => {
    const r = rows(csv(line(base), line({ n: "2", step: "Yes" }), line({ ...base, place_id: "p3", n: "3" })));
    expect(r.rows.map((x) => x.id)).toEqual(["p1", "p3"]);
    expect(r.skipped).toBe(1);
  });
  it("undoes the apostrophe a spreadsheet guard adds, and no other", () => {
    const [x] = rows(csv(line({ ...base, place_name: "=SUM(1)", notes: "'quoted' note" }))).rows;
    expect(x!.name).toBe("=SUM(1)");
    expect(x!.notes).toBe("'quoted' note");
  });
  it("removes control characters from text cells", () => {
    const text = csv(line({ ...base, notes: "a\u0001b\u0000c" }));
    expect(rows(text).rows[0]!.notes).toBe("abc");
  });
  it("cuts very long notes", () => {
    const [x] = rows(csv(line({ ...base, notes: "n".repeat(2000) }))).rows;
    expect(x!.notes.length).toBe(MAX_RESULT_NOTES);
    expect(x!.notes.endsWith("…")).toBe(true);
  });
  it("keeps commas, quotes and line breaks inside a note", () => {
    const [x] = rows(csv(line({ ...base, notes: 'It said "ring, then wait"\nfor help' }))).rows;
    expect(x!.notes).toBe('It said "ring, then wait"\nfor help');
  });
  it("reads a header in any letter case, with spaces around the names", () => {
    const text = `${SPOT_CSV_HEADER.map((h) => ` ${h.toUpperCase()} `).join(",")}\r\n${line(base)}\r\n`;
    expect(rows(text).rows).toHaveLength(1);
  });
  it("reads a short row without failing, treating missing cells as blank", () => {
    const text = `${HEAD}\r\n1,p1,Name\r\n`;
    const [x] = rows(text).rows;
    expect(x).toMatchObject({ id: "p1", name: "Name", tag: "UNKNOWN" });
  });
  it("reads a place with the same id twice as two rows, as typed", () => {
    expect(rows(csv(line(base), line({ ...base, n: "2" }))).rows).toHaveLength(2);
  });
  it("reads a place the pack named with accents and symbols", () => {
    const [x] = rows(csv(line({ ...base, place_name: "Café « Un » 東京" }))).rows;
    expect(x!.name).toBe("Café « Un » 東京");
  });
});

describe("readSpotResults on a real sheet that was filled in", () => {
  it("round-trips from the sheet's CSV to rows with the typed answers", () => {
    const places = [place("a", { name: "Alpha" }), place("b", { name: "Beta", wheelchair: "no" })];
    const sheet = buildSpotSheet(sampleForSpotCheck(places, { size: 2, seed: "x", balanced: false }), "x", false, "en", "2026-11-21");
    const empty = spotSheetToCsv(sheet).split("\r\n");
    const filled = [empty[0], ...empty.slice(1, -1).map((l) => `${l.replace(/,,,,,,,$/, ",Yes,No,Yes,Yes,Different,2026-11-22,Saw it")}`), ""].join("\r\n");
    const r = rows(filled);
    expect(r.rows).toHaveLength(2);
    for (const x of r.rows) {
      expect(x.answers).toEqual({ step: "yes", door: "no", ramp: "yes", level: "yes", match: "different" });
      expect(x.dateLooked).toBe("2026-11-22");
      expect(x.notes).toBe("Saw it");
    }
  });
});
