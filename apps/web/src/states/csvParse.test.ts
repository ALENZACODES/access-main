import { describe, expect, it } from "vitest";
import { csvCell } from "./exportData";
import { MAX_CSV_BYTES, MAX_CSV_ROWS, parseCsv, undoFormulaGuard } from "./csvParse";

const rowsOf = (text: string) => {
  const r = parseCsv(text);
  if (!r.ok) throw new Error(r.error);
  return r.rows;
};

describe("parseCsv", () => {
  it("reads plain rows with CRLF, LF or a lone CR", () => {
    expect(rowsOf("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(rowsOf("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(rowsOf("a,b\rc,d\r")).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("reads no rows from empty text", () => {
    expect(rowsOf("")).toEqual([]);
    expect(rowsOf("\r\n\r\n")).toEqual([]);
  });
  it("drops a leading byte order mark and only that", () => {
    expect(rowsOf("﻿a,b\r\n")).toEqual([["a", "b"]]);
    expect(rowsOf("a,﻿b")).toEqual([["a", "﻿b"]]);
  });
  it("keeps empty cells, including a trailing one", () => {
    expect(rowsOf("a,,c\r\n,,\r\nx,\r\n")).toEqual([["a", "", "c"], ["", "", ""], ["x", ""]]);
  });
  it("skips blank lines between rows", () => {
    expect(rowsOf("a\r\n\r\nb\r\n")).toEqual([["a"], ["b"]]);
  });
  it("reads quoted cells with commas, doubled quotes and line breaks", () => {
    expect(rowsOf('"a,b","say ""hi""","line1\r\nline2"\r\n')).toEqual([["a,b", 'say "hi"', "line1\r\nline2"]]);
  });
  it("keeps spaces inside and around cells", () => {
    expect(rowsOf(" a , b ")).toEqual([[" a ", " b "]]);
    expect(rowsOf('" a ", b')).toEqual([[" a ", " b"]]);
  });
  it("treats a quote in the middle of an unquoted cell as text", () => {
    expect(rowsOf('ab"c,d')).toEqual([['ab"c', "d"]]);
  });
  it("reads a quoted empty cell as empty", () => {
    expect(rowsOf('a,"",c')).toEqual([["a", "", "c"]]);
    expect(rowsOf('"",x')).toEqual([["", "x"]]);
  });
  it("reads a file without a final line end", () => {
    expect(rowsOf("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(rowsOf('a,"b"')).toEqual([["a", "b"]]);
  });
  it("reads non-ASCII text unchanged", () => {
    expect(rowsOf("café,Montréal,€\r\n")).toEqual([["café", "Montréal", "€"]]);
  });
  it("fails on a quote that is never closed", () => {
    expect(parseCsv('a,"b\r\nc,d')).toEqual({ ok: false, error: "unterminated-quote" });
    expect(parseCsv('"')).toEqual({ ok: false, error: "unterminated-quote" });
  });
  it("fails on text over the size limit, before reading it", () => {
    expect(parseCsv("a".repeat(MAX_CSV_BYTES + 1))).toEqual({ ok: false, error: "too-large" });
    expect(parseCsv("é".repeat(MAX_CSV_BYTES / 2 + 1))).toEqual({ ok: false, error: "too-large" });
  });
  it("fails on too many rows", () => {
    expect(parseCsv("a\n".repeat(MAX_CSV_ROWS + 1))).toEqual({ ok: false, error: "too-many-rows" });
    expect(parseCsv("a\n".repeat(MAX_CSV_ROWS)).ok).toBe(true);
  });
  it("reads back what csvCell writes, for hard cases", () => {
    const cells = ["plain", "a,b", 'say "hi"', "two\r\nlines", "", " padded ", "é€", "x,\"y\"\r\nz"];
    const text = `${cells.map(csvCell).join(",")}\r\n`;
    expect(rowsOf(text)).toEqual([cells]);
  });
});

describe("undoFormulaGuard", () => {
  it("removes the apostrophe csvCell adds before a formula character", () => {
    for (const original of ["=1+1", "+x", "-5", "@name", "\tcell", "\rcell"]) {
      expect(undoFormulaGuard(csvCell(original).replace(/^"|"$/g, "").replace(/""/g, '"')), JSON.stringify(original)).toBe(original);
    }
  });
  it("leaves an apostrophe that is not guarding a formula", () => {
    expect(undoFormulaGuard("'hello")).toBe("'hello");
    expect(undoFormulaGuard("it's")).toBe("it's");
    expect(undoFormulaGuard("'")).toBe("'");
    expect(undoFormulaGuard("''=x")).toBe("''=x");
  });
  it("only removes one apostrophe", () => {
    expect(undoFormulaGuard("'=x")).toBe("=x");
    expect(undoFormulaGuard("'-'=x")).toBe("-'=x");
  });
});
