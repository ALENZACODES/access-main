import { describe, expect, it } from "vitest";
import { USER_NAMES, membersIn, namesIn, readTemplate, userLooking } from "./dgInterp";

describe("readTemplate", () => {
  it("splits the fixed text and the expressions", () => {
    const s = "`a ${x} b ${y + 1} c`";
    expect(readTemplate(s, 0)).toEqual({ text: ["a ", " b ", " c"], exprs: ["x", "y + 1"], closed: true, end: s.length });
  });
  it("reads a template with no expression", () => expect(readTemplate("`plain`", 0)).toMatchObject({ text: ["plain"], exprs: [], closed: true, end: 7 }));
  it("reads an empty template", () => expect(readTemplate("``", 0)).toMatchObject({ text: [""], exprs: [], closed: true, end: 2 }));
  it("reads from an index in a longer text, and stops after the template", () => {
    const s = "throw new Error(`n ${v}`); rest";
    const r = readTemplate(s, 16);
    expect(r.exprs).toEqual(["v"]);
    expect(s.slice(r.end)).toBe("); rest");
  });
  it("reads an expression that holds braces, strings and a template of its own", () => {
    const r = readTemplate("`${ f({ a: 1 }) } and ${ g(`in ${h}`) } and ${'}'}`", 0);
    expect(r.exprs).toEqual(["f({ a: 1 })", "g(`in ${h}`)", "'}'"]);
    expect(r.closed).toBe(true);
  });
  it("keeps an escaped backtick and an escaped dollar as text", () => {
    const r = readTemplate("`a \\` b \\${x}`", 0);
    expect(r.exprs).toEqual([]);
    expect(r.closed).toBe(true);
  });
  it("says a template is not closed, and a ${ that is not closed", () => {
    expect(readTemplate("`abc", 0).closed).toBe(false);
    expect(readTemplate("`a ${x", 0).closed).toBe(false);
    expect(readTemplate("`a ${x", 0).end).toBe(6);
  });
  it("gives an empty result when the text at the index is not a backtick", () => expect(readTemplate("'x'", 0)).toEqual({ text: [], exprs: [], closed: false, end: 3 }));
  it("does not throw on odd text", () => {
    for (const s of ["", "`", "`${", "`${}`", "`${`", "`$`", "`\\", "`${'`}"]) expect(() => readTemplate(s, 0)).not.toThrow();
  });
});

describe("namesIn", () => {
  it("lists the names an expression reads, in order", () => expect(namesIn("a + b * c")).toEqual(["a", "b", "c"]));
  it("leaves out a member after a dot", () => expect(namesIn("spec.name")).toEqual(["spec"]));
  it("leaves out a member after an optional chain", () => expect(namesIn("a?.b?.c")).toEqual(["a"]));
  it("leaves out keywords", () => expect(namesIn("x instanceof Error ? true : null")).toEqual(["x", "Error"]));
  it("leaves out the text of strings, and reads names after them", () => expect(namesIn("'a b' + c + \"d\"")).toEqual(["c"]));
  it("reads a name after a call", () => expect(namesIn("f(g, h.i)")).toEqual(["f", "g", "h"]));
  it("reads a name that follows a closing bracket after a dot is gone", () => expect(namesIn("a.b + c")).toEqual(["a", "c"]));
  it("is empty for an expression with no name", () => expect(namesIn("1 + 2")).toEqual([]));
  it("does not read a number as a name", () => expect(namesIn("x1 + 2y")).toEqual(["x1", "y"]));
});

describe("membersIn", () => {
  it("lists the members after dots", () => expect(membersIn("a.b.c")).toEqual(["b", "c"]));
  it("reads an optional chain and spaces", () => expect(membersIn("a?.b . c")).toEqual(["b", "c"]));
  it("is empty when there is no member", () => expect(membersIn("a + b")).toEqual([]));
});

describe("userLooking", () => {
  it.each(["query", "search", "text", "input", "note", "comment", "name", "label", "title", "address", "email", "phone", "postal", "zip", "city", "lat", "lon", "coords", "location", "user", "content", "description", "draft", "answer", "reply"])("%s looks like a user value", (n) => expect(USER_NAMES.test(n)).toBe(true));
  it.each(["id", "count", "path", "code", "index", "limit", "selector", "hex", "message", "data", "value", "names", "labelled", "queryString"])("%s does not", (n) => expect(USER_NAMES.test(n)).toBe(false));
  it("matches in any case", () => expect(USER_NAMES.test("Email")).toBe(true));
  it("gives the user-looking names of an expression, once each, including members", () => expect(userLooking("query + spec.name + query")).toEqual(["query", "name"]));
  it("gives none when none look like a user value", () => expect(userLooking("p.map((x) => x.code).join(', ')")).toEqual([]));
  it("reads a name inside an arrow body", () => expect(userLooking("items.map((i) => i.label)")).toEqual(["label"]));
});
