import { describe, expect, it } from "vitest";
import { countSuppressions, isScannedFile, readDirective, scanSuppressions, SUPPRESS_KINDS, type Suppression } from "./suppressScan";

const scan = (text: string, path = "apps/web/src/x.ts"): Suppression[] => scanSuppressions([{ path, text }]);
const kinds = (text: string, path?: string): string[] => scan(text, path).map((s) => s.kind);

describe("isScannedFile", () => {
  it.each([
    ["a.ts", true],
    ["a.tsx", true],
    ["a.js", true],
    ["a.jsx", true],
    ["a.mjs", true],
    ["a.cjs", true],
    ["a.mts", true],
    ["a.cts", true],
    ["a/b/c.test.ts", true],
    ["a.json", false],
    ["a.md", false],
    ["a.css", false],
    ["a.ts.map", false],
    ["node_modules/x/a.ts", false],
    ["apps/web/node_modules/x/a.js", false],
    ["apps/web/dist/a.js", false],
    ["dist/a.js", false],
    [".lanes/x/a.ts", false],
    ["apps/web/.lanes-tmp/a.ts", false],
    ["apps/web/src/distance.ts", true],
    ["apps/web/src/builder.ts", true],
  ])("%s is %s", (p, ok) => expect(isScannedFile(p)).toBe(ok));
});

describe("readDirective", () => {
  it.each([
    [" @ts-ignore", "ts-ignore", [], null],
    [" @ts-ignore because the type is wrong", "ts-ignore", [], "because the type is wrong"],
    [" @ts-nocheck", "ts-nocheck", [], null],
    [" @ts-expect-error: the overload is wrong", "ts-expect-error", [], "the overload is wrong"],
    [" @ts-expect-error -- wrong overload", "ts-expect-error", [], "wrong overload"],
    ["@ts-expect-error", "ts-expect-error", [], null],
    [" eslint-disable-next-line no-control-regex", "eslint-disable-next-line", ["no-control-regex"], null],
    [" eslint-disable-line no-alert -- the demo needs it", "eslint-disable-line", ["no-alert"], "the demo needs it"],
    [" eslint-disable", "eslint-disable", [], null],
    [" eslint-disable no-undef, no-console", "eslint-disable", ["no-undef", "no-console"], null],
    [" eslint-disable-next-line a/b,  c/d  -- why", "eslint-disable-next-line", ["a/b", "c/d"], "why"],
    [" eslint-disable-next-line a --", "eslint-disable-next-line", ["a"], null],
    [" eslint-disable-next-line\n   a,\n   b", "eslint-disable-next-line", ["a", "b"], null],
  ] as const)("%j is %s", (text, kind, rules, reason) => expect(readDirective(text)).toEqual({ kind, rules, reason }));

  it.each([[" a note about @ts-ignore"], [" eslint-enable no-console"], [" eslint-disabled"], [" prettier-ignore"], [" TODO: remove"], [""], [" @ts-ignored"], [" see eslint-disable-line"]])("%j is not a directive", (t) => expect(readDirective(t)).toBeNull());
});

describe("scanSuppressions: directives", () => {
  it("finds a directive in a line comment with its line", () => {
    const r = scan("a;\n// @ts-expect-error: wrong overload here\nb();");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ path: "apps/web/src/x.ts", line: 2, kind: "ts-expect-error", reason: "wrong overload here" });
  });
  it("finds a directive in a block comment and in a JSX comment", () => {
    expect(kinds("/* @ts-ignore */\nx;")).toEqual(["ts-ignore"]);
    expect(kinds("const a = <div>{/* eslint-disable-next-line jsx-a11y/no-autofocus */}</div>;")).toEqual(["eslint-disable-next-line"]);
  });
  it("finds the kinds of ESLint directive", () => {
    expect(kinds("/* eslint-disable */\n// eslint-disable-line x\n// eslint-disable-next-line y")).toEqual(["eslint-disable", "eslint-disable-line", "eslint-disable-next-line"]);
  });
  it("does not find a directive that is written in a string, a template or a regex", () => {
    expect(kinds('const a = "// @ts-ignore";\nconst b = `// eslint-disable`;')).toEqual([]);
    expect(kinds("const r = /@ts-ignore/;")).toEqual([]);
  });
  it("does not find a comment that only mentions a directive", () => expect(kinds("// this is not a @ts-ignore\n// nor eslint-disable here")).toEqual([]));
  it("keeps the rules and the reason of an ESLint directive", () => {
    const r = scan("// eslint-disable-next-line a/b, c -- because of d\nx;")[0];
    expect(r?.rules).toEqual(["a/b", "c"]);
    expect(r?.reason).toBe("because of d");
  });
  it("shortens the detail to the first 80 characters of the comment", () => expect(scan(`// @ts-expect-error ${"x".repeat(200)}\ny;`)[0]?.detail).toHaveLength(80));
  it("reads a comment inside a template expression", () => expect(kinds("const a = `${ /* @ts-ignore */ b }`;")).toEqual(["ts-ignore"]));
  it("finds directives in files of every scanned kind, and in no other", () => {
    const text = "// @ts-ignore\n";
    expect(scanSuppressions([{ path: "a.js", text }, { path: "b.json", text }, { path: "node_modules/c.ts", text }])).toHaveLength(1);
  });
  it("gives files in path order and lines in order", () => {
    const r = scanSuppressions([
      { path: "b.ts", text: "// @ts-ignore\n" },
      { path: "a.ts", text: "x;\n// @ts-ignore\n// @ts-nocheck\n" },
    ]);
    expect(r.map((s) => `${s.path}:${s.line}`)).toEqual(["a.ts:2", "a.ts:3", "b.ts:1"]);
  });
});

describe("scanSuppressions: the type any", () => {
  it.each([
    ["const a: any = 1;", 1],
    ["function f(a: any) {}", 1],
    ["const a = b as any;", 1],
    ["const a = <any>b;", 1],
    ["let a: any[] = [];", 1],
    ["let a: Array<any> = [];", 1],
    ["let a: Map<string, any>;", 1],
    ["let a: Map<any, string>;", 1],
    ["function f(): any { return 1; }", 1],
    ["const a: any = b as any;", 2],
    ["const a: string = 'any';", 0],
    ["const company = 1; // : any", 0],
    ["const a = `x: any`;", 0],
    ["const anyone = 1; const many = 2;", 0],
    ["type T = { any: number };", 0],
    ["const f = (a: unknown) => a;", 0],
    ["const x = cond ? a : anything;", 0],
  ])("%j has %i uses", (text, n) => expect(scan(text).filter((s) => s.kind === "any")).toHaveLength(n));

  it("counts a use once when two shapes match the same place", () => expect(scan("let a: Array<any>;").filter((s) => s.kind === "any")).toHaveLength(1));
  it("gives the line of a use", () => expect(scan("a;\nb;\nlet c: any;")[0]?.line).toBe(3));
  it("gives the text that matched", () => expect(scan("const a = b as any;")[0]?.detail).toBe("as any"));
  it("finds no rules or reason for a use of any", () => expect(scan("let a: any;")[0]).toMatchObject({ rules: [], reason: null }));
  it("reads a use that comes after a comment on the same line", () => expect(scan("/* c */ let a: any;")).toHaveLength(1));
});

describe("countSuppressions", () => {
  const s = (path: string, kind: Suppression["kind"], rules: string[]): Suppression => ({ path, line: 1, kind, rules, reason: null, detail: "" });
  it("counts one row for each path, kind and rule list", () => {
    const c = countSuppressions([s("a.ts", "eslint-disable-next-line", ["x"]), s("a.ts", "eslint-disable-next-line", ["x"]), s("a.ts", "eslint-disable-next-line", ["y"]), s("b.ts", "any", [])]);
    expect(c).toEqual([
      { path: "a.ts", kind: "eslint-disable-next-line", rules: "x", count: 2 },
      { path: "a.ts", kind: "eslint-disable-next-line", rules: "y", count: 1 },
      { path: "b.ts", kind: "any", rules: "", count: 1 },
    ]);
  });
  it("joins several rules with a comma and a space, in the order written", () => expect(countSuppressions([s("a.ts", "eslint-disable", ["b", "a"])])[0]?.rules).toBe("b, a"));
  it("is empty for nothing found", () => expect(countSuppressions([])).toEqual([]));
  it("sorts by path, then kind, then rules", () => {
    const c = countSuppressions([s("b.ts", "any", []), s("a.ts", "ts-ignore", []), s("a.ts", "any", [])]);
    expect(c.map((r) => `${r.path} ${r.kind}`)).toEqual(["a.ts any", "a.ts ts-ignore", "b.ts any"]);
  });
  it("counts what scanSuppressions found", () => {
    const f = scan("// eslint-disable-next-line a\nx;\n// eslint-disable-next-line a\ny;\nlet z: any;");
    expect(countSuppressions(f).map((r) => r.count)).toEqual([1, 2]);
  });
});

describe("SUPPRESS_KINDS", () => {
  it("lists every kind once", () => {
    expect(new Set(SUPPRESS_KINDS).size).toBe(SUPPRESS_KINDS.length);
    expect(SUPPRESS_KINDS).toHaveLength(7);
  });
});
