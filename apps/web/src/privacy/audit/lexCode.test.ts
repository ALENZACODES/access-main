import { describe, expect, it } from "vitest";
import { lexCode, lineAt, lineStarts } from "./lexCode";

const code = (s: string): string => lexCode(s).code;
const comments = (s: string): string[] => lexCode(s).comments.map((c) => `${c.kind}@${c.line}:${c.text}`);

describe("lineStarts and lineAt", () => {
  it("gives the start of every line", () => expect(lineStarts("a\nbb\n\nc")).toEqual([0, 2, 5, 6]));
  it("gives one start for text with no break", () => expect(lineStarts("abc")).toEqual([0]));
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [4, 2],
    [5, 3],
    [6, 4],
    [99, 4],
  ])("index %i is on line %i", (i, line) => expect(lineAt(lineStarts("a\nbb\n\nc"), i)).toBe(line));
});

describe("comments", () => {
  it("finds a line comment with its line and text", () => expect(comments("a;\n// note\nb;")).toEqual(["line@2: note"]));
  it("finds a block comment that runs over lines, on the line it starts", () => expect(comments("a;\n/* one\ntwo */ b;")).toEqual(["block@2: one\ntwo "]));
  it("finds several comments in order", () => expect(comments("// a\n/* b */ // c")).toEqual(["line@1: a", "block@2: b ", "line@2: c"]));
  it("finds a doc comment", () => expect(comments("/** doc */")).toEqual(["block@1:* doc "]));
  it("reads a comment at the end with no break", () => expect(comments("x // end")).toEqual(["line@1: end"]));
  it("reads a block comment that is not closed to the end", () => expect(comments("x /* open")).toEqual(["block@1: open"]));
  it("gives the start and end of a comment", () => {
    const c = lexCode("ab // cd\nef").comments[0];
    expect([c?.start, c?.end]).toEqual([3, 8]);
  });
  it("does not find a comment inside a string, a template or a regex", () => {
    expect(comments('const a = "// no"; const b = \'/* no */\'; const c = `// no`;')).toEqual([]);
    expect(comments("const r = /a\\/\\/b/;")).toEqual([]);
  });
  it("does not take a division or a URL-like string for a comment", () => {
    expect(comments("a = b / c / d;")).toEqual([]);
    expect(comments('u = "a//b";')).toEqual([]);
  });
});

describe("code", () => {
  it("blanks a comment and keeps the line breaks", () => expect(code("a; // c\nb;")).toBe("a;     \nb;"));
  it("blanks a block comment over lines, keeping each break", () => expect(code("a/*x\ny*/b")).toBe("a   \n   b"));
  it("keeps the length of the text", () => {
    const s = "const a = `x${b}y`; // c\n/* d */ f('e', /g/);";
    expect(code(s)).toHaveLength(s.length);
  });
  it("blanks the inside of a string and keeps the quotes", () => {
    expect(code("a = 'xy'; b = \"zw\";")).toBe("a = '  '; b = \"  \";");
  });
  it("reads an escaped quote as part of the string", () => expect(code("a = 'it\\'s'; b;")).toBe("a = '     '; b;"));
  it("ends a string at the end of the line when it is not closed", () => expect(code("a = 'open\nb;")).toBe("a = '    \nb;"));
  it("blanks template text and keeps code inside ${ }", () => expect(code("a = `x${b + 1}y`;")).toBe("a = ` ${b + 1} `;"));
  it("reads a template inside a template", () => expect(code("a = `p${`q${c}r`}s`;")).toBe("a = ` ${` ${c} `} `;"));
  it("keeps a brace in code inside ${ } from ending it early", () => expect(code("a = `p${ {x: 1}.x }q`; b;")).toBe("a = ` ${ {x: 1}.x } `; b;"));
  it("reads a template that runs over lines", () => expect(code("a = `x\ny`;\nb;")).toBe("a = ` \n `;\nb;"));
  it("blanks the inside of a regex and keeps the slashes and flags", () => expect(code("r = /a+b/gi;")).toBe("r = /   /gi;"));
  it("reads a slash inside a class and an escaped slash as part of the regex", () => expect(code("r = /[/]\\//;")).toBe("r = /     /;"));
  it("reads a division as code", () => expect(code("x = a / b / c;")).toBe("x = a / b / c;"));
  it("reads a regex after return, a bracket or a comma", () => {
    expect(code("f(/a/, /b/);")).toBe("f(/ /, / /);");
    expect(code("x = [/a/];")).toBe("x = [/ /];");
  });
  it("does not blank code after a regex", () => expect(code("r = /a/.test(s);")).toBe("r = / /.test(s);"));
  it("leaves a slash that cannot start a regex on its line alone", () => expect(code("x = (a) / 2;")).toBe("x = (a) / 2;"));
  it("reads a slash that has no end on its line as code", () => expect(code("x = /abc\ny;")).toBe("x = /abc\ny;"));
  it("keeps code that is not a comment, a string or a regex exactly", () => {
    const s = "export function f(a: number): number { return a * 2; }";
    expect(code(s)).toBe(s);
  });
  it("does not let a directive-like comment show in the code", () => expect(code("// eslint-disable-next-line x\nlet a;").includes("eslint")).toBe(false));
  it("does not throw on odd text", () => {
    for (const s of ["", "`", "'", '"', "/*", "//", "/", "${", "}", "`${", "`${`", "a`b${c", "\\", "/[", "x = /[a/"]) expect(() => lexCode(s)).not.toThrow();
  });
  it("keeps the length for odd text too", () => {
    for (const s of ["`", "'", "/*", "`${", "a`b${c", "x = /[a/"]) expect(lexCode(s).code).toHaveLength(s.length);
  });
});
