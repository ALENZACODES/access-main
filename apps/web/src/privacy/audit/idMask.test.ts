import { describe, expect, it } from "vitest";
import { lineAt, maskCode } from "./idMask";

describe("maskCode keeps the shape of the text", () => {
  const samples = [
    "const a = 1; // note",
    "/* block\nspanning */ x();",
    'const s = "it\'s \\" here"; y();',
    "const t = `a ${b} c`;",
    "const r = /ab+c/gi.test(x);",
    "a / b / c",
    "`${`${x}`}`",
    "'unterminated\nnext();",
    "",
  ];
  it.each(samples)("same length and same lines for %j", (s) => {
    const m = maskCode(s);
    expect(m).toHaveLength(s.length);
    expect(m.split("\n")).toHaveLength(s.split("\n").length);
    for (let i = 0; i < s.length; i++) if (s[i] === "\n") expect(m[i]).toBe("\n");
  });
});

describe("maskCode blanks what is not code", () => {
  it("blanks a line comment but not the code before it", () => expect(maskCode("x(); // navigator.userAgent")).toBe("x();                        ".slice(0, 5) + " ".repeat(22)));
  it("blanks a block comment across lines", () => expect(maskCode("a /* b\nc */ d")).toBe("a     \n     d"));
  it("blanks the text of a double quoted string and keeps its quotes", () => expect(maskCode('f("navigator.userAgent")')).toBe('f("' + " ".repeat(19) + '")'));
  it("blanks the text of a single quoted string", () => expect(maskCode("f('Math.random')")).toBe("f('" + " ".repeat(11) + "')"));
  it("understands an escaped quote inside a string", () => expect(maskCode('f("a\\"Math.random"); g()')).toContain("g()"));
  it("blanks the text of a template but keeps the expression in it", () => {
    const m = maskCode("`id ${Math.random()} Math.random`");
    expect(m.match(/Math\.random/g)).toHaveLength(1);
    expect(m.startsWith("`   ${Math.random()}")).toBe(true);
  });
  it("reads a template inside a template expression", () => {
    const m = maskCode("`a ${`b ${crypto.randomUUID()}`} c`");
    expect(m).toContain("crypto.randomUUID()");
    expect(m).not.toContain("b ");
  });
  it("keeps the braces of an object inside a template expression", () => expect(maskCode("`${ {a: 1}.a } navigator`")).not.toContain("navigator"));
  it("blanks a regular expression after an operator", () => expect(maskCode("x = /navigator\\.userAgent/.test(y)")).not.toContain("navigator"));
  it("blanks a regular expression after return", () => expect(maskCode("return /Math.random/.test(y)")).not.toContain("Math"));
  it("takes a slash after a closing bracket as division", () => expect(maskCode("(a) / navigator / 2")).toContain("navigator"));
  it("takes a slash after a name as division", () => expect(maskCode("a / navigator / b")).toContain("navigator"));
  it("keeps a slash in a class inside a regular expression inside the expression", () => expect(maskCode("x = /[/]navigator/;")).not.toContain("navigator"));
  it("keeps the flags of a regular expression", () => expect(maskCode("x = /a/gi;")).toBe("x = / /gi;"));
  it("leaves a lone slash that starts no regular expression", () => expect(maskCode("x = /\nnavigator")).toContain("navigator"));
  it("stops a string at the end of its line", () => expect(maskCode("'open\nnavigator.userAgent")).toContain("navigator.userAgent"));
  it("keeps a template open across lines", () => expect(maskCode("`line\nnavigator`")).not.toContain("navigator"));
  it("keeps code that follows a comment on the next line", () => expect(maskCode("// c\nnavigator.language")).toContain("navigator.language"));
  it("reads an unterminated block comment to the end", () => expect(maskCode("a /* navigator")).toBe("a " + " ".repeat(12)));
});

describe("maskCode reads JSX", () => {
  it("does not take a self-closing tag for a regular expression", () => {
    const m = maskCode('<A b="x" /><B c={navigator.language} />');
    expect(m).toContain("navigator.language");
  });
  it("does not take a closing tag for a regular expression", () => expect(maskCode("<p>{navigator.language}</p><q>{Math.random()}</q>")).toContain("Math.random()"));
  it("reads an apostrophe in the text of an element as text, and keeps the code after it", () => expect(maskCode("<p>Don't {navigator.language}</p>")).toContain("navigator.language"));
  it("blanks a string that does close, even when it holds an apostrophe of the other kind", () => expect(maskCode(`<p title="it's">{Math.random()}</p>`)).toContain("Math.random()"));
  it("keeps the line breaks of a multi-line element", () => expect(maskCode("<p>\n  Isn't\n  {x}\n</p>").split("\n")).toHaveLength(4));
  it("reads an unterminated string at the end of the file as code", () => expect(maskCode("a = 'b")).toBe("a = '"+ "b"));
});

describe("lineAt", () => {
  it("counts from 1", () => expect(lineAt("a\nb\nc", 0)).toBe(1));
  it("counts the lines before the index", () => expect(lineAt("a\nb\nc", 4)).toBe(3));
  it("stops at the end of the text", () => expect(lineAt("a\nb", 99)).toBe(2));
  it("agrees with the mask, since the mask keeps the lines", () => {
    const s = "a\n/* x\ny */ navigator\nz";
    expect(lineAt(maskCode(s), maskCode(s).indexOf("navigator"))).toBe(3);
  });
});
