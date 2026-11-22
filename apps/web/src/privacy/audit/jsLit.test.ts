import { describe, expect, it } from "vitest";
import {
  arrOf,
  boolOf,
  captureExpr,
  decodeEscapes,
  duplicateKeys,
  evalNumeric,
  findCalls,
  findDecl,
  getKey,
  hasSpread,
  identTokens,
  lineOf,
  matchClose,
  numOf,
  parseLiteral,
  showNode,
  skipRegex,
  skipString,
  skipTemplate,
  skipTrivia,
  strOf,
  type JNode,
} from "./jsLit";

const read = (s: string): JNode => parseLiteral(s).node;

describe("lineOf", () => {
  it.each([
    ["", 0, 1],
    ["a", 1, 1],
    ["a\nb", 2, 2],
    ["a\nb\nc", 4, 3],
    ["\n\n\n", 3, 4],
  ])("%j at %i is line %i", (s, i, line) => expect(lineOf(s, i)).toBe(line));

  it("does not run past the end of the text", () => expect(lineOf("a\nb", 99)).toBe(2));
});

describe("skipString", () => {
  it.each([
    ['"abc"', 0, 5],
    ["'abc' + 1", 0, 5],
    ['"a\\"b"', 0, 6],
    ["'a\\\\'", 0, 5],
    ['x = "ab"', 4, 8],
  ])("%j from %i ends at %i", (s, i, end) => expect(skipString(s, i)).toBe(end));

  it("is -1 for a string left open or one that runs over a line", () => {
    expect(skipString('"abc', 0)).toBe(-1);
    expect(skipString('"abc\ndef"', 0)).toBe(-1);
    expect(skipString("'a\\", 0)).toBe(-1);
  });

  it("hands a back-tick string to the template reader", () => expect(skipString("`a\nb`", 0)).toBe(5));
});

describe("skipTemplate", () => {
  it("passes a plain template, with a line break", () => expect(skipTemplate("`a\nb` x", 0)).toBe(5));
  it("passes text inside ${ } even when it holds a brace, a quote or another template", () => {
    expect(skipTemplate("`a${ {b: 1}.b }c`", 0)).toBe(17);
    expect(skipTemplate("`a${ '}' }c`", 0)).toBe(12);
    expect(skipTemplate("`a${ `x${1}` }c`", 0)).toBe(16);
  });
  it("passes an escaped back-tick and an escaped dollar", () => {
    expect(skipTemplate("`a\\`b`", 0)).toBe(6);
    expect(skipTemplate("`\\${x}`", 0)).toBe(7);
  });
  it("is -1 when it is not closed, or when ${ is not", () => {
    expect(skipTemplate("`abc", 0)).toBe(-1);
    expect(skipTemplate("`a${b`", 0)).toBe(-1);
    expect(skipTemplate("`a${ '", 0)).toBe(-1);
  });
});

describe("skipRegex", () => {
  it.each([
    ["/abc/", 5],
    ["/a\\/b/g", 7],
    ["/[/]/i", 6],
    ["/^\\/packs\\//", 12],
    ["/a/gimsuy x", 9],
  ])("%j ends at %i", (s, end) => expect(skipRegex(s, 0)).toBe(end));

  it("is -1 when the line ends first", () => {
    expect(skipRegex("/abc", 0)).toBe(-1);
    expect(skipRegex("/ab\ncd/", 0)).toBe(-1);
    expect(skipRegex("/[ab/", 0)).toBe(-1);
  });
});

describe("skipTrivia", () => {
  it("skips white space, line comments and block comments", () => {
    expect(skipTrivia("  \t\n x", 0)).toBe(5);
    expect(skipTrivia("// c\nx", 0)).toBe(5);
    expect(skipTrivia("/* a\nb */ x", 0)).toBe(10);
    expect(skipTrivia("/*a*//*b*/ x", 0)).toBe(11);
  });
  it("stops at code, including a slash that starts nothing", () => {
    expect(skipTrivia("a // c", 0)).toBe(0);
    expect(skipTrivia("/ 2", 0)).toBe(0);
  });
  it("runs a line comment at the end of the text to the end, with no break", () => expect(skipTrivia("// c", 0)).toBe(4));
  it("reports a block comment that is not closed and runs to the end", () => {
    const seen: number[] = [];
    expect(skipTrivia("a /* b", 1, (i) => seen.push(i))).toBe(6);
    expect(seen).toEqual([2]);
  });
  it("treats a no-break space and a byte-order mark as white space", () => expect(skipTrivia(" ﻿x", 0)).toBe(2));
});

describe("decodeEscapes", () => {
  it.each([
    ["a\\nb", "a\nb"],
    ["\\t\\r\\b\\f\\v\\0", "\t\r\b\f\v\0"],
    ["\\x41\\u0042", "AB"],
    ["\\u00e9", "é"],
    ["\\\\", "\\"],
    ["\\'\\\"", "'\""],
    ["\\q", "q"],
    ["\\xZZ", "xZZ"],
    ["\\u12", "u12"],
    ["a\\\nb", "ab"],
    ["end\\", "end"],
    ["", ""],
  ])("%j reads as %j", (body, out) => expect(decodeEscapes(body)).toBe(out));
});

describe("evalNumeric", () => {
  it.each([
    ["60 * 60 * 24 * 7", 604800],
    ["2 + 3 * 4", 14],
    ["(2 + 3) * 4", 20],
    ["10 / 4", 2.5],
    ["-3 + 5", 2],
    ["- -3", 3],
    ["1.5 * 2", 3],
    [".5 + .5", 1],
    ["7", 7],
    ["2 - 3 - 4", -5],
    ["((1))", 1],
  ])("%j is %d", (s, v) => expect(evalNumeric(s)).toBe(v));

  it.each([["x * 2"], [""], ["1 +"], ["(1"], ["1 2"], ["1 / 0"], ["2 ** 3"], ["1e3"], ["0x10"], ["1)"], ["+"], ["a"], ["1 * * 2"]])("%j is not a number", (s) => expect(evalNumeric(s)).toBeNull());

  it("refuses a very long text", () => expect(evalNumeric("1+".repeat(150) + "1")).toBeNull());
});

describe("captureExpr", () => {
  const cap = (s: string): string => s.slice(0, captureExpr(s, 0, s.length).end);
  it("ends at a comma, a semicolon or a closing bracket outside any brackets", () => {
    expect(cap("a.b, c")).toBe("a.b");
    expect(cap("a; b")).toBe("a");
    expect(cap("a ) b")).toBe("a");
    expect(cap("a } b")).toBe("a");
  });
  it("keeps what is inside brackets, strings, templates and regexes", () => {
    expect(cap("f(a, b), c")).toBe("f(a, b)");
    expect(cap("[1, 2][0], c")).toBe("[1, 2][0]");
    expect(cap('"a,b", c')).toBe('"a,b"');
    expect(cap("`a,${b}`, c")).toBe("`a,${b}`");
    expect(cap("x.test(/a,b)/), c")).toBe("x.test(/a,b)/)");
  });
  it("tells a division from a regex by what comes before it", () => {
    expect(cap("a / b / c, d")).toBe("a / b / c");
    expect(cap("x = /,/, d")).toBe("x = /,/");
  });
  it("sees an arrow only outside brackets", () => {
    expect(captureExpr("(a) => a, b", 0, 11).arrow).toBe(true);
    expect(captureExpr("f((a) => a), b", 0, 14).arrow).toBe(false);
  });
  it("keeps the body of an arrow function in braces", () => expect(cap("() => { return [1, 2]; }, x")).toBe("() => { return [1, 2]; }"));
  it("does not take a comment after the expression for part of it", () => expect(cap("1 // note\n, 2")).toBe("1"));
  it("stops at the end it is given", () => expect(captureExpr("a b c d", 0, 3).end).toBe(3));
  it("runs to the end when a string is not closed", () => expect(captureExpr('a "b', 0, 4).end).toBe(4));
});

describe("matchClose", () => {
  it.each([
    ["(a)", 0, 2],
    ["f(a(b)c)d", 1, 7],
    ["[ ')' ]", 0, 6],
    ["{ /* } */ }", 0, 10],
    ["( /[)]/ )", 0, 8],
    ["(`)`)", 0, 4],
  ])("%j from %i closes at %i", (s, o, e) => expect(matchClose(s, o)).toBe(e));
  it("is -1 when nothing closes it", () => {
    expect(matchClose("(a", 0)).toBe(-1);
    expect(matchClose("('a)", 0)).toBe(-1);
  });
});

describe("plain values", () => {
  it.each<[string, JNode["kind"]]>([
    ['"a"', "str"],
    ["'a'", "str"],
    ["`a`", "str"],
    ["12", "num"],
    ["-4", "num"],
    ["60 * 60", "num"],
    ["true", "bool"],
    ["false", "bool"],
    ["null", "null"],
    ["/a/g", "regex"],
    ["abc", "ref"],
    ["a.b.c", "ref"],
    ["() => 1", "fn"],
    ["(a, b) => a + b", "fn"],
    ["x => x", "fn"],
    ["async () => 1", "fn"],
    ["function () {}", "fn"],
    ["function f(a) { return a; }", "fn"],
    ["f(1)", "call"],
    ["a.b.c(1, 2)", "call"],
    ["new RegExp('a')", "expr"],
    ["a + b", "expr"],
    ["a ? b : c", "expr"],
    ["`a${b}`", "expr"],
    ["undefined", "ref"],
  ])("%j is a %s", (s, kind) => expect(read(s).kind).toBe(kind));

  it("reads the value of a string, a number and a boolean", () => {
    expect(strOf(read('"a\\nb"'))).toBe("a\nb");
    expect(numOf(read("604800"))).toBe(604800);
    expect(numOf(read("60 * 60 * 24 * 7"))).toBe(604800);
    expect(boolOf(read("true"))).toBe(true);
    expect(strOf(read("`plain`"))).toBe("plain");
  });

  it("keeps a regex, a function and an expression as written", () => {
    expect(showNode(read("/^\\/packs\\//"))).toBe("/^\\/packs\\//");
    expect(showNode(read("({ url }) => url.pathname"))).toBe("({ url }) => url.pathname");
    expect(showNode(read("new RegExp(`${a}data/`)"))).toBe("new RegExp(`${a}data/`)");
  });

  it("reads a string that is part of a sum as an expression, not as the string", () => {
    const n = read('"a" + "b"');
    expect(n.kind).toBe("expr");
    expect(showNode(n)).toBe('"a" + "b"');
  });

  it("reads a call with its callee and its arguments", () => {
    const n = read('path.resolve(root, "x", 3)');
    expect(n.kind).toBe("call");
    if (n.kind !== "call") return;
    expect(n.callee).toBe("path.resolve");
    expect(n.args.map((a) => a.kind)).toEqual(["ref", "str", "num"]);
  });

  it("does not take a call followed by more text for a call", () => expect(read("f(1).g").kind).toBe("expr"));
  it("does not take a value beyond its end for part of it", () => expect(parseLiteral("1, 2").end).toBe(1));
});

describe("objects", () => {
  it("reads keys of every kind", () => {
    const n = read("{ a: 1, 'b-c': 2, \"d\": 3, 4: 5, [e]: 6, f }");
    expect(n.kind).toBe("obj");
    if (n.kind !== "obj") return;
    expect(n.entries.map((e) => e.key)).toEqual(["a", "b-c", "d", "4", "[e]", "f"]);
    expect(n.entries[5]?.value).toMatchObject({ kind: "ref", name: "f" });
  });

  it("allows a comma at the end and comments anywhere", () => {
    const r = parseLiteral("{\n  // one\n  a: 1, /* two */ b: 2,\n}");
    expect(r.problems).toEqual([]);
    expect(getKey(r.node, "b")).toMatchObject({ kind: "num", value: 2 });
  });

  it("records the line of each entry", () => {
    const n = read("{\n  a: 1,\n\n  b: {\n    c: 2,\n  },\n}");
    if (n.kind !== "obj") throw new Error("not an object");
    expect(n.entries.map((e) => e.line)).toEqual([2, 4]);
    expect(getKey(getKey(n, "b"), "c")?.line).toBe(5);
  });

  it("reads a method as a function with its name", () => {
    const n = read("{ manual(id) { return id; }, b: 1 }");
    expect(getKey(n, "manual")?.kind).toBe("fn");
    expect(numOf(getKey(n, "b"))).toBe(1);
  });

  it("reads an async or get method under its own name", () => {
    const n = read("{ async load() { return 1; }, get size() { return 2; } }");
    expect(getKey(n, "load")?.kind).toBe("fn");
    expect(getKey(n, "size")?.kind).toBe("fn");
  });

  it("keeps a spread and says so", () => {
    const n = read("{ ...base, a: 1 }");
    expect(hasSpread(n)).toBe(true);
    expect(duplicateKeys(n)).toEqual([]);
    if (n.kind !== "obj") return;
    expect(n.entries[0]).toMatchObject({ key: "...", spread: true });
  });

  it("gives the last of a key that is written twice, and lists the key", () => {
    const n = read("{ a: 1, b: 2, a: 3, a: 4 }");
    expect(numOf(getKey(n, "a"))).toBe(4);
    expect(duplicateKeys(n)).toEqual(["a", "a"]);
  });

  it("reads a nested object, a list in it and a value after a comment", () => {
    const n = read("{ a: { b: [1, { c: 'x' }] }, d: /* d */ 4 }");
    expect(strOf(getKey(arrOf(getKey(getKey(n, "a"), "b"))?.[1], "c"))).toBe("x");
    expect(numOf(getKey(n, "d"))).toBe(4);
  });

  it("reads an object with no keys", () => {
    const n = read("{}");
    expect(n).toMatchObject({ kind: "obj", entries: [] });
  });

  it("reads a value that holds a comma inside a call, a function or a template", () => {
    const n = read("{ a: f(1, 2), b: (x, y) => [x, y], c: `a,b`, d: 'e,f' }");
    expect(getKey(n, "a")?.kind).toBe("call");
    expect(getKey(n, "b")?.kind).toBe("fn");
    expect(strOf(getKey(n, "c"))).toBe("a,b");
    expect(strOf(getKey(n, "d"))).toBe("e,f");
  });
});

describe("lists", () => {
  it("reads items of every kind, with holes and a spread", () => {
    const n = read("[1, 'a', , true, ...rest, /x/, f]");
    expect(arrOf(n)?.map((i) => i.kind)).toEqual(["num", "str", "bool", "ref", "regex", "ref"]);
  });
  it("reads an empty list and a list of lists", () => {
    expect(arrOf(read("[]"))).toEqual([]);
    expect(arrOf(read("[[1], [2, 3]]"))?.map((x) => arrOf(x)?.length)).toEqual([1, 2]);
  });
  it("records the line of each item", () => expect(arrOf(read("[\n 1,\n 2,\n]"))?.map((i) => i.line)).toEqual([2, 3]));
});

describe("problems", () => {
  const problems = (s: string): string[] => parseLiteral(s).problems.map((p) => `${p.line}:${p.message}`);

  it("reports a string that is not closed, and still reads the rest of the line", () => {
    expect(problems('{ a: "b,\n c: 1 }')).toEqual(["1:a string is not closed"]);
    expect(numOf(getKey(read('{ a: "b,\n c: 1 }'), "c"))).toBe(1);
  });
  it("reports an object and a list that are not closed", () => {
    expect(problems("{ a: 1")).toEqual(["1:an object is not closed"]);
    expect(problems("[1, 2")).toEqual(["1:a list is not closed"]);
  });
  it("reports a template and a comment that are not closed", () => {
    expect(problems("`abc")).toEqual(["1:a template is not closed"]);
    expect(problems("{ a: /* x")).toContain("1:a comment is not closed");
  });
  it("reports a missing colon, a missing comma in a list and a missing key", () => {
    expect(problems("{ a 1 }")).toEqual(["1:a colon was expected after the key"]);
    expect(problems("[1 ) 2]")).toEqual(["1:a comma was expected"]);
    expect(problems("{ : 1 }")).toEqual(["1:a key was expected"]);
  });
  it("reports a missing value", () => expect(problems("{ a: }")).toEqual(["1:a value is missing"]));
  it("reports text nested too deeply, and does not fail on it", () => {
    const deep = "[".repeat(300) + "]".repeat(300);
    expect(parseLiteral(deep).problems.some((p) => p.message === "the text is nested too deeply")).toBe(true);
  });
  it("reports nothing for text that is fine", () => expect(problems("{ a: [1, 2], b: 'c' }")).toEqual([]));
  it("never throws on odd text", () => {
    for (const s of ["", " ", "}", ")", "]", ",", "{{", "[[", "'", '"', "`", "/", "/*", "...", "{ ... }", "{ [", "{ a: (", "f(", "f(1", "a =>", "=>", "{ a: => }", "\\", "{ 'a", "x(", "{ get }", "{ async }"]) {
      expect(() => parseLiteral(s)).not.toThrow();
    }
  });
});

describe("findCalls", () => {
  const src = [
    "import { VitePWA } from 'vite-plugin-pwa';",
    "// VitePWA({ commented: true })",
    "const s = \"VitePWA({ inString: true })\";",
    "const t = `VitePWA({ inTemplate: true })`;",
    "function VitePWA(x) { return x; }",
    "obj.VitePWA({ method: true });",
    "export default {",
    "  plugins: [",
    "    VitePWA({",
    "      registerType: 'prompt',",
    "      workbox: { clientsClaim: true },",
    "    }),",
    "  ],",
    "};",
  ].join("\n");

  it("finds a call in code and not in a comment, a string, a template, a declaration or a method call", () => {
    const calls = findCalls(src, "VitePWA");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.line).toBe(9);
  });
  it("reads the arguments of the call", () => {
    const arg = findCalls(src, "VitePWA")[0]?.args[0];
    expect(strOf(getKey(arg, "registerType"))).toBe("prompt");
    expect(boolOf(getKey(getKey(arg, "workbox"), "clientsClaim"))).toBe(true);
  });
  it("gives the line of an entry as the line in the file", () => {
    const arg = findCalls(src, "VitePWA")[0]?.args[0];
    expect(getKey(arg, "registerType")?.line).toBe(10);
  });
  it("finds every call, in order, and reads several arguments", () => {
    const calls = findCalls("f(1, 'a');\nx = f({ b: 2 });", "f");
    expect(calls.map((c) => c.line)).toEqual([1, 2]);
    expect(calls[0]?.args.map((a) => a.kind)).toEqual(["num", "str"]);
  });
  it("finds nothing when there is no such call, or the name only starts the word", () => {
    expect(findCalls("VitePWAx({})", "VitePWA")).toEqual([]);
    expect(findCalls("", "f")).toEqual([]);
    expect(findCalls("f", "f")).toEqual([]);
  });
  it("reports a call that is not closed and reads what is there", () => {
    const c = findCalls("f({ a: 1 ", "f")[0];
    expect(c?.problems.map((p) => p.message)).toContain("a call is not closed");
    expect(numOf(getKey(c?.args[0], "a"))).toBe(1);
  });
  it("finds a call after a regex that holds a quote", () => expect(findCalls("const r = /'/; f({});", "f")).toHaveLength(1));
});

describe("findDecl", () => {
  const src = "const a = 1;\nlet b = { c: 2 };\nvar d: string = 'x';\nconst e = f(1);\nif (g == h) {}\nconst k => 1;";
  it("reads const, let and var", () => {
    expect(numOf(findDecl(src, "a")?.node)).toBe(1);
    expect(numOf(getKey(findDecl(src, "b")?.node, "c"))).toBe(2);
  });
  it("reads a call", () => expect(findDecl(src, "e")?.node.kind).toBe("call"));
  it("does not read a declaration with a type, a comparison or an arrow, or a name that is not declared", () => {
    expect(findDecl(src, "d")).toBeNull();
    expect(findDecl(src, "g")).toBeNull();
    expect(findDecl(src, "k")).toBeNull();
    expect(findDecl(src, "zz")).toBeNull();
  });
  it("does not read a declaration in a comment or a string", () => {
    expect(findDecl("// const a = 1\n", "a")).toBeNull();
    expect(findDecl("const s = 'const a = 1';", "a")).toBeNull();
  });
});

describe("identTokens", () => {
  it("lists the words of the code and not those in comments, strings or regexes", () => {
    const toks = identTokens("a + b // c\n'd'; x = /e/; f(`g`) /* h */ i");
    expect(toks.map((t) => t.name)).toEqual(["a", "b", "x", "f", "i"]);
  });
  it("gives the character before a word", () => {
    const t = identTokens("x.y = z");
    expect(t.map((x) => x.prev)).toEqual(["", ".", "="]);
  });
  it("reads a division as a division", () => expect(identTokens("a / b / c").map((t) => t.name)).toEqual(["a", "b", "c"]));
});

describe("showNode and the accessors", () => {
  it.each<[string, string]>([
    ['"a"', '"a"'],
    ["3", "3"],
    ["true", "true"],
    ["null", "null"],
    ["abc", "abc"],
    ["f(1)", "f(…)"],
    ["[1, 2]", "[2 items]"],
    ["{ a: 1 }", "{1 keys}"],
    ["/x/", "/x/"],
  ])("%j is shown as %s", (s, shown) => expect(showNode(read(s))).toBe(shown));

  it("shows an absent value", () => expect(showNode(undefined)).toBe("(absent)"));
  it("gives null for a value of another kind, and for no value", () => {
    expect(strOf(read("1"))).toBeNull();
    expect(numOf(read("'1'"))).toBeNull();
    expect(boolOf(read("'true'"))).toBeNull();
    expect(arrOf(read("{}"))).toBeNull();
    expect(strOf(undefined)).toBeNull();
    expect(getKey(read("[1]"), "a")).toBeUndefined();
    expect(getKey(undefined, "a")).toBeUndefined();
    expect(duplicateKeys(read("1"))).toEqual([]);
    expect(hasSpread(read("[...a]"))).toBe(false);
  });
});
