import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { parseCsv, undoFormulaGuard } from "./csvParse";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";
import { type VisitMark, marksForPlaces } from "./visitMarks";
import { MARKS_CSV_COLUMNS, marksFileName, marksToCsv, marksToText } from "./visitMarksExport";

const TODAY = "2026-11-21";
const mk = (id: string, status: VisitMark["status"], markedOn: string | null = "2026-11-01"): VisitMark => ({ id, status, markedOn });
const places = [place("a", { name: "Alpha Hall", address: "1 Main Street" }), place("b", { name: "Beta Court", address: null }), place("c", { name: "Gamma Gate" }), bare("d")];
const rows = marksForPlaces([mk("a", "to-visit"), mk("c", "ruled-out", null), mk("b", "to-visit", "2026-11-05")], places);
const read = (csv: string) => {
  const r = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (!r.ok) throw new Error("csv did not parse");
  return r.rows as string[][];
};

describe("marksToCsv", () => {
  it("has the header and one row for each place in the order given, with CRLF lines", () => {
    const csv = marksToCsv(rows);
    expect(csv.startsWith(`${MARKS_CSV_COLUMNS.join(",")}\r\n`)).toBe(true);
    expect(read(csv).map((r) => r[0])).toEqual(["id", "a", "b", "c", "d"]);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("gives the mark, the day and the address, with none and UNKNOWN where there is nothing", () => {
    const [, a, b, c, d] = read(marksToCsv(rows));
    expect(a).toEqual(["a", "Alpha Hall", "to-visit", "2026-11-01", "1 Main Street"]);
    expect(b).toEqual(["b", "Beta Court", "to-visit", "2026-11-05", "UNKNOWN"]);
    expect(c?.slice(2, 4)).toEqual(["ruled-out", "UNKNOWN"]);
    expect(d).toEqual(["d", "UNKNOWN", "none", "UNKNOWN", "UNKNOWN"]);
  });
  it("has the header only for no places and a byte order mark when asked", () => {
    expect(marksToCsv([])).toBe(`${MARKS_CSV_COLUMNS.join(",")}\r\n`);
    expect(marksToCsv([], { bom: true }).charCodeAt(0)).toBe(0xfeff);
    expect(marksToCsv([]).charCodeAt(0)).not.toBe(0xfeff);
  });
  it("has the same number of cells in every row", () => {
    for (const r of read(marksToCsv(rows))) expect(r).toHaveLength(MARKS_CSV_COLUMNS.length);
  });
  it("quotes awkward names and reads them back the same", () => {
    const awkward = 'Tom & "Jerry", the place';
    const r = read(marksToCsv(marksForPlaces([], [place("x", { name: awkward })])));
    expect(r[1]?.[1]).toBe(awkward);
  });
  it("neutralises a name that would run as a formula", () => {
    const r = read(marksToCsv(marksForPlaces([], [place("x", { name: "=1+1" })])));
    expect(r[1]?.[1]?.startsWith("'")).toBe(true);
    expect(undoFormulaGuard(r[1]![1]!)).toBe("=1+1");
  });
});

describe("marksToText", () => {
  const text = marksToText(rows, TODAY, "en");
  it("has the title, the day and the lead", () => {
    expect(text.startsWith("My marks on the listed places\n=============================")).toBe(true);
    expect(text).toContain("As of 21 November 2026.");
    expect(text).toContain("These marks are your own notes.");
  });
  it("counts the marks", () => {
    expect(text).toContain("2 to visit, 0 been there, 1 ruled out, 1 with no mark.");
  });
  it("groups by status in a fixed order, and keeps the list's order inside a group", () => {
    const at = (s: string) => text.indexOf(s);
    expect(at("To visit\n--------")).toBeLessThan(at("Ruled out\n---------"));
    expect(at("Ruled out\n---------")).toBeLessThan(at("No mark\n-------"));
    expect(at("- Alpha Hall")).toBeLessThan(at("- Beta Court"));
    expect(text).not.toContain("Been there\n");
  });
  it("gives the address and the day when there are some", () => {
    expect(text).toContain("- Alpha Hall, 1 Main Street (1 November 2026)");
    expect(text).toContain("- Beta Court (5 November 2026)");
    expect(text).toContain("- Gamma Gate, 1 Main Street\n");
  });
  it("names a place that has no name by its id", () => {
    expect(text).toContain("- Unnamed place d");
  });
  it("says no place is on the list for none", () => {
    expect(marksToText([], TODAY, "en")).toContain("No place is on the list.");
  });
  it("is in French with French colons and dates", () => {
    const fr = marksToText(rows, TODAY, "fr");
    expect(fr).toContain("Mes marques sur les lieux de la liste");
    expect(fr).toContain("En date du 21 novembre 2026.");
    expect(fr).toContain("À visiter\n---------");
    expect(fr).toContain("(5 novembre 2026)");
  });
  it("has no line the linters reject outside the places' own text", () => {
    for (const l of ["en", "fr"] as const) {
      const t = marksToText(rows, TODAY, l);
      for (const line of t.split("\n").filter((x) => x && !x.startsWith("- "))) {
        expect(lintCopy(line, l), `${l}: ${line}`).toEqual([]);
        if (l === "fr") expect(lintFrench(line), line).toEqual([]);
      }
    }
  });
  it("does not rank: the order of places in a group is the list's order, not the names'", () => {
    const reversed = marksForPlaces([mk("a", "been"), mk("b", "been")], [places[1]!, places[0]!]);
    const t = marksToText(reversed, TODAY, "en");
    expect(t.indexOf("- Beta Court")).toBeLessThan(t.indexOf("- Alpha Hall"));
  });
});

describe("marksFileName", () => {
  it("names the file for the day and kind", () => {
    expect(marksFileName("csv", TODAY)).toBe("visit-marks-2026-11-21.csv");
    expect(marksFileName("txt", TODAY)).toBe("visit-marks-2026-11-21.txt");
  });
});
