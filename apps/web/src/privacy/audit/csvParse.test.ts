import { describe, expect, it } from "vitest";
import { csvCell } from "../panel/inventoryExport";
import { parseCsv } from "./csvParse";

const ok = (rows: string[][]): string => rows.map((r) => `${r.join(",")}\r\n`).join("");

describe("parseCsv: well-formed files", () => {
  it("reads rows and cells", () => {
    expect(parseCsv("a,b\r\nc,d\r\n", ",")).toEqual({ rows: [["a", "b"], ["c", "d"]], problems: [] });
  });
  it("reads an empty cell, an empty file and a file of one empty cell", () => {
    expect(parseCsv("a,,c\r\n", ",").rows).toEqual([["a", "", "c"]]);
    expect(parseCsv("", ",")).toEqual({ rows: [], problems: [] });
    expect(parseCsv("\r\n", ",").rows).toEqual([[""]]);
  });
  it("reads a quoted cell with the delimiter, a doubled quotation mark and a line break", () => {
    expect(parseCsv('"a,b","say ""hi""","x\r\ny"\r\n', ",").rows).toEqual([["a,b", 'say "hi"', "x\r\ny"]]);
  });
  it("reads a semicolon file with commas inside cells", () => {
    expect(parseCsv("a,b;c\r\n", ";").rows).toEqual([["a,b", "c"]]);
  });
  it("reads a quoted empty cell", () => {
    expect(parseCsv('"",a\r\n', ",").rows).toEqual([["", "a"]]);
  });
  it("reads what the App's own writer writes, for awkward values", () => {
    const values = ["plain", "a,b", 'q"uote', "line\nbreak", "=SUM(A1)", "-1", "@x", "", " lead", "é — ’ « »"];
    const text = `${values.map((v) => csvCell(v, ",")).join(",")}\r\n`;
    const r = parseCsv(text, ",");
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toEqual(values.map((v) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)));
  });
});

describe("parseCsv: problems", () => {
  it("reports a line that ends with a bare line feed", () => {
    expect(parseCsv("a,b\nc,d\r\n", ",").problems).toEqual(["line 1: a line ends with a line feed and no carriage return"]);
  });
  it("reports a carriage return without a line feed", () => {
    expect(parseCsv("a\rb\r\n", ",").problems).toEqual(["line 1: a carriage return without a line feed"]);
  });
  it("reports a quotation mark inside an unquoted cell", () => {
    expect(parseCsv('a"b,c\r\n', ",").problems).toEqual(["line 1: a quotation mark inside a cell that is not wrapped in quotation marks"]);
  });
  it("reports text after a closing quotation mark", () => {
    expect(parseCsv('"a"b,c\r\n', ",").problems).toEqual(["line 1: text after a closing quotation mark"]);
  });
  it("reports a quotation mark that is never closed", () => {
    expect(parseCsv('"a,b\r\n', ",").problems).toContain("line 2: a quotation mark is never closed");
  });
  it("reports a file that does not end with a line break, and still reads the last row", () => {
    const r = parseCsv("a,b", ",");
    expect(r.rows).toEqual([["a", "b"]]);
    expect(r.problems).toEqual(["the file does not end with a line break"]);
  });
  it("counts lines inside a quoted cell", () => {
    expect(parseCsv('"a\nb"x\r\n', ",").problems).toEqual(["line 2: text after a closing quotation mark"]);
  });
  it("is a pure function of its input", () => {
    const text = ok([["a", "b"]]);
    expect(parseCsv(text, ",")).toEqual(parseCsv(text, ","));
  });
});
