import { describe, expect, it } from "vitest";
import { lineAt, maskCode } from "./tmMask";

describe("maskCode", () => {
  it("keeps the length and the line breaks", () => {
    const t = 'const a = "x"; // note\n/* b\nc */ const d = `t${1}`;\n';
    const m = maskCode(t);
    expect(m.length).toBe(t.length);
    expect(m.split("\n").length).toBe(t.split("\n").length);
  });
  it("blanks a line comment and a block comment", () => {
    expect(maskCode("a(); // Date.now()")).not.toContain("Date");
    expect(maskCode("a(); /* Date.now() */ b();")).not.toContain("Date");
    expect(maskCode("a(); /* Date\n.now() */ b();")).toContain("b();");
  });
  it("blanks the inside of both kinds of quote and keeps the quotes", () => {
    expect(maskCode(`x("Date.now()")`)).toBe(`x("          ")`);
    expect(maskCode(`x('Date.now()')`)).toBe(`x('          ')`);
  });
  it("reads an escaped quote as part of the string", () => {
    expect(maskCode(`x("a\\"Date.now()")`)).not.toContain("Date");
  });
  it("blanks the text of a template and keeps the code in ${ }", () => {
    const m = maskCode("`Date.now() ${new Date().getTime()} more`");
    expect(m).toContain("new Date().getTime()");
    expect(m).not.toContain("Date.now()");
    expect(m).not.toContain("more");
  });
  it("handles a template inside a template", () => {
    const m = maskCode("`a ${`b ${performance.now()} c`} d`");
    expect(m).toContain("performance.now()");
    expect(m).not.toContain("b ");
  });
  it("handles braces inside the code of a template", () => {
    const m = maskCode("`${ {a: 1}.a } text` + Date.now()");
    expect(m).toContain("Date.now()");
    expect(m).not.toContain("text");
  });
  it("spans lines in a template", () => {
    const m = maskCode("`line one\nDate.now()\nline three`; Date.now();");
    expect(m.match(/Date\.now\(\)/g)).toHaveLength(1);
  });
  it("blanks a regular expression body", () => {
    expect(maskCode("const r = /Date\\.now\\(\\)/g;")).not.toContain("Date");
    expect(maskCode("x.replace(/[/]Date/, '')")).not.toContain("Date");
  });
  it("does not take a division for a regular expression", () => {
    expect(maskCode("const a = b / c; Date.now(); const d = e / f;")).toContain("Date.now()");
  });
  it("does not take a closing JSX tag for a regular expression", () => {
    expect(maskCode("<a>x</a>; Date.now();")).toContain("Date.now()");
    expect(maskCode("<br />; Date.now();")).toContain("Date.now()");
  });
  it("reads an apostrophe in JSX text as code, so the next line is not lost", () => {
    const m = maskCode("<p>don't stop</p>\nDate.now();");
    expect(m).toContain("Date.now()");
  });
  it("keeps code after a comment on the same line as a string", () => {
    expect(maskCode('f("a"); Date.now(); // "b"')).toContain("Date.now()");
  });
  it("does not stop on an unclosed block comment, it blanks to the end", () => {
    expect(maskCode("a(); /* Date.now()")).not.toContain("Date");
  });
  it("gives an empty text back", () => expect(maskCode("")).toBe(""));
});

describe("lineAt", () => {
  it("counts from 1", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(1);
    expect(lineAt("a\nb\nc", 2)).toBe(2);
    expect(lineAt("a\nb\nc", 4)).toBe(3);
  });
  it("is the last line for an index past the end", () => expect(lineAt("a\nb", 99)).toBe(2));
});
