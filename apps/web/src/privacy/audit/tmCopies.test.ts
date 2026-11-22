import { describe, expect, it } from "vitest";
import { compileCopy, extractFunctions, groupCopies, normaliseSource } from "./tmCopies";

const file = (text: string, path = "apps/web/src/a.ts") => ({ path, text });

describe("extractFunctions", () => {
  it("takes out a declaration with its types and its body", () => {
    const f = extractFunctions(file("const x = 1;\nfunction localDate(d: Date): string {\n  const p = (n: number): string => String(n);\n  return `${d.getFullYear()}`;\n}\nconst y = 2;"), "localDate");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ name: "localDate", path: "apps/web/src/a.ts", line: 2 });
    expect(f[0]?.source.startsWith("function localDate(d: Date): string {")).toBe(true);
    expect(f[0]?.source.endsWith("}")).toBe(true);
    expect(f[0]?.source).not.toContain("const y");
  });
  it("finds an exported and an async declaration", () => {
    expect(extractFunctions(file("export function f() {}"), "f")).toHaveLength(1);
    expect(extractFunctions(file("export async function f() {}"), "f")).toHaveLength(1);
  });
  it("does not find a function with another name, a call, or a name in a comment or string", () => {
    expect(extractFunctions(file("function g() {}\nf();\n// function f() {}\nconst s = 'function f() {}';"), "f")).toEqual([]);
    expect(extractFunctions(file("function xf() {}"), "f")).toEqual([]);
  });
  it("takes a body whose braces are in a template string or a nested block", () => {
    const f = extractFunctions(file("function f(a: number) {\n if (a) { return `}${a}{`; }\n return 0;\n}\nconst after = 1;"), "f");
    expect(f[0]?.source.endsWith("return 0;\n}")).toBe(true);
  });
  it("takes a result type with braces in it", () => {
    const f = extractFunctions(file("function f(a: number): { x: number } {\n return { x: a };\n}"), "f");
    expect(f[0]?.source).toContain("return { x: a };");
  });
  it("finds two copies in one file, and none in an empty one", () => {
    expect(extractFunctions(file("function f() {}\nfunction f() {}"), "f")).toHaveLength(2);
    expect(extractFunctions(file(""), "f")).toEqual([]);
  });
  it("skips a declaration with no body", () => expect(extractFunctions(file("function f(a: number)"), "f")).toEqual([]));
});

describe("normaliseSource and groupCopies", () => {
  it("makes layout the same", () => expect(normaliseSource("  a\n\t b   c ")).toBe("a b c"));
  it("groups copies by text, the largest first, with sorted paths", () => {
    const g = groupCopies([
      { name: "f", path: "b.ts", line: 1, source: "function f() { return 1; }" },
      { name: "f", path: "a.ts", line: 1, source: "function f() {\n  return 1;\n}" },
      { name: "f", path: "c.ts", line: 1, source: "function f() { return 2; }" },
    ]);
    expect(g.map((x) => x.paths)).toEqual([["a.ts", "b.ts"], ["c.ts"]]);
  });
  it("gives no groups for no copies", () => expect(groupCopies([])).toEqual([]));
});

describe("compileCopy", () => {
  const copy = (source: string) => ({ name: "f", path: "a.ts", line: 1, source });
  it("removes the types and gives a function that runs", () => {
    const f = compileCopy<[number], string>(copy("function f(n: number): string { const p = (k: number): string => String(k).padStart(2, '0'); return p(n); }"));
    expect(f(7)).toBe("07");
  });
  it("handles an exported declaration", () => expect(compileCopy<[], number>(copy("export function f(): number { return 3; }"))()).toBe(3));
  it("has no access to the module around it", () => expect(() => compileCopy<[], number>(copy("function f(): number { return notThere; }"))()).toThrow(ReferenceError));
});
