import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { spreadCsvFile, spreadToCsv, spreadToText } from "./tagNoteSpreadExport";
import { TS_CSV_HEADER, TS_CSV_NAME } from "./tagNoteMoreCopy";
import type { SpreadRow } from "./tagNoteSpread";

const rows: SpreadRow[] = [
  { key: "cafe", label: "cafe", checked: 4, flagged: 2, clear: 1, percent: 50 },
  { key: "x", label: "=SUM(1)", checked: 1, flagged: 0, clear: 0, percent: 0 },
  { key: "q", label: 'a "b", c', checked: 3, flagged: 3, clear: 3, percent: 100 },
];

describe("spreadToCsv", () => {
  it("writes the header and one row per kind with CRLF line ends", () => {
    const csv = spreadToCsv(rows);
    expect(csv.endsWith("\r\n")).toBe(true);
    const p = parseCsv(csv);
    expect(p.ok && p.rows[0]).toEqual([...TS_CSV_HEADER]);
    expect(p.ok && p.rows).toHaveLength(4);
    expect(p.ok && p.rows[1]).toEqual(["cafe", "4", "2", "1", "50"]);
  });
  it("guards a kind that a spreadsheet could read as a formula", () => {
    expect(spreadToCsv(rows)).toContain("'=SUM(1)");
  });
  it("quotes commas and quotes", () => {
    const p = parseCsv(spreadToCsv(rows));
    expect(p.ok && p.rows[3]![0]).toBe('a "b", c');
  });
  it("starts with a byte order mark only when asked", () => {
    expect(spreadToCsv(rows).charCodeAt(0)).not.toBe(0xfeff);
    expect(spreadToCsv(rows, { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });
  it("writes only the header for no rows", () => expect(spreadToCsv([])).toBe(TS_CSV_HEADER.join(",") + "\r\n"));
});

describe("spreadToText", () => {
  it("starts with the caption and has a line per kind", () => {
    const t = spreadToText(rows, "en").trim().split("\n");
    expect(t[0]).toBe("Places with a note, by kind");
    expect(t).toHaveLength(2 + rows.length);
    expect(t[2]).toBe("cafe: Compared 4, Point different ways 2, Clear cases 1, Share 50%");
  });
  it("puts a non-breaking space before the percent sign in French", () => expect(spreadToText(rows, "fr")).toContain("Part 50 %"));
});

describe("spreadCsvFile", () => {
  it("names the file for the language and sets the type", () => {
    expect(spreadCsvFile(rows, "fr")).toMatchObject({ name: TS_CSV_NAME.fr, mime: "text/csv;charset=utf-8" });
    expect(spreadCsvFile(rows, "en").content.charCodeAt(0)).toBe(0xfeff);
  });
});
