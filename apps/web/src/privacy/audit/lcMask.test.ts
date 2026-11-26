import { describe, expect, it } from "vitest";
import { lineAt, maskCode } from "./lcMask";

describe("maskCode", () => {
  it("keeps the length and the line breaks", () => {
    const t = 'const a = "x"; // note\n/* b\nc */ const d = `t${1}`;\n';
    const m = maskCode(t);
    expect(m.length).toBe(t.length);
    expect(m.split("\n")).toHaveLength(t.split("\n").length);
  });
  it("blanks comments of both kinds", () => {
    expect(maskCode("a(); // x.lat.toFixed(9)")).not.toContain("toFixed");
    expect(maskCode("a(); /* x.lat\n.toFixed(9) */ b();")).toContain("b();");
  });
  it("blanks the inside of both quotes and keeps the quotes", () => {
    expect(maskCode(`f("x.lat")`)).toBe(`f("     ")`);
    expect(maskCode(`f('x.lat')`)).toBe(`f('     ')`);
  });
  it("treats an escaped quote as part of the string", () => expect(maskCode(`f("a\\"x.lat")`)).not.toContain("lat"));
  it("blanks template text and keeps the code in ${ }", () => {
    const m = maskCode("`lat ${p.lat.toFixed(5)} more`");
    expect(m).toContain("p.lat.toFixed(5)");
    expect(m).not.toContain("more");
  });
  it("handles a template in a template and braces in the code", () => {
    expect(maskCode("`a ${`b ${p.lon} c`} d`")).toContain("p.lon");
    expect(maskCode("`${ {a: 1}.a } text` + p.lat")).toContain("p.lat");
  });
  it("blanks a regular expression body but not a division", () => {
    expect(maskCode("const r = /p\\.lat/g;")).not.toContain("lat");
    expect(maskCode("const a = b / c; p.lat; const d = e / f;")).toContain("p.lat");
  });
  it("does not take JSX closing tags for a regular expression", () => {
    expect(maskCode("<a>x</a>; p.lat;")).toContain("p.lat");
    expect(maskCode("<br />; p.lat;")).toContain("p.lat");
  });
  it("reads an apostrophe in JSX text as code", () => expect(maskCode("<p>don't stop</p>\np.lat;")).toContain("p.lat"));
  it("blanks an unclosed block comment to the end", () => expect(maskCode("a(); /* p.lat")).not.toContain("lat"));
  it("gives an empty text back", () => expect(maskCode("")).toBe(""));
});

describe("lineAt", () => {
  it("counts from 1 and stays on the last line past the end", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(1);
    expect(lineAt("a\nb\nc", 4)).toBe(3);
    expect(lineAt("a\nb", 99)).toBe(2);
  });
});
