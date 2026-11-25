import { describe, expect, it } from "vitest";
import { isArray, isObject, keyLine, parseJsonc, stripJsonc } from "./jsonc";

describe("stripJsonc", () => {
  it("blanks a line comment and keeps the line", () => expect(stripJsonc('{\n  "a": 1 // note\n}')).toBe('{\n  "a": 1        \n}'));
  it("blanks a block comment that runs over lines, keeping each break", () => expect(stripJsonc('{ /* a\nb */ "a": 1 }')).toBe('{     \n     "a": 1 }'));
  it("takes out a comma before a closing bracket, and keeps other commas", () => {
    expect(stripJsonc('{"a": [1, 2,], "b": 3,}')).toBe('{"a": [1, 2 ], "b": 3 }');
  });
  it("takes out a comma that is followed by a comment and then a bracket", () => expect(JSON.parse(stripJsonc('{"a": 1, // last\n}'))).toEqual({ a: 1 }));
  it("does not change a string that holds comment marks or a comma and a bracket", () => {
    const s = '{"a": "// not a comment, ]", "b": "/* x */"}';
    expect(stripJsonc(s)).toBe(s);
  });
  it("reads an escaped quote inside a string", () => {
    const s = '{"a": "x\\" // y", "b": 1}';
    expect(stripJsonc(s)).toBe(s);
  });
  it("takes a byte-order mark off the start", () => expect(stripJsonc("﻿{}")).toBe("{}"));
  it("does not take out a comma that is followed by a value", () => expect(stripJsonc("[1, 2]")).toBe("[1, 2]"));
  it("keeps the length when there is no mark at the start", () => {
    const s = '{ // c\n "a": [1,], /* d */ }';
    expect(stripJsonc(s)).toHaveLength(s.length);
  });
  it("leaves a comment that is not closed blanked to the end", () => expect(stripJsonc("{ /* open").trim()).toBe("{"));
});

describe("parseJsonc", () => {
  it("reads plain JSON", () => expect(parseJsonc('{"a": [1, true, null, "x"]}')).toEqual({ value: { a: [1, true, null, "x"] }, problem: null, line: 1 }));
  it("reads comments and trailing commas", () => {
    const r = parseJsonc('{\n  // one\n  "a": 1, /* two */\n  "b": [1, 2,],\n}');
    expect(r.problem).toBeNull();
    expect(r.value).toEqual({ a: 1, b: [1, 2] });
  });
  it("reports text that is not JSON, with a line", () => {
    const r = parseJsonc('{\n  "a": 1,\n  "b": oops\n}');
    expect(r.value).toBeUndefined();
    expect(r.problem).not.toBeNull();
    expect(r.line).toBeGreaterThanOrEqual(1);
    expect(r.line).toBeLessThanOrEqual(4);
  });
  it("reports an empty text", () => expect(parseJsonc("").value).toBeUndefined());
  it("reports a text that is only a comment", () => expect(parseJsonc("// nothing").value).toBeUndefined());
  it("does not throw on odd text", () => {
    for (const s of ["{", "}", "[", '"', "{'a': 1}", "{a: 1}", "\u0000", "/*", "1 2"]) expect(() => parseJsonc(s)).not.toThrow();
  });
  it("reads a value that is not an object", () => expect(parseJsonc("[1]").value).toEqual([1]));
});

describe("keyLine", () => {
  const text = '{\n  // "hidden": 1\n  "a": 1,\n  "outer": {\n    "a": 2\n  }\n}';
  it("gives the line of the first key with the name", () => expect(keyLine(text, "a")).toBe(3));
  it("does not take a key in a comment", () => expect(keyLine(text, "hidden")).toBe(0));
  it("starts from an index", () => expect(keyLine(text, "a", text.indexOf('"outer"'))).toBe(5));
  it("is 0 for a key that is not there", () => expect(keyLine(text, "zzz")).toBe(0));
  it("does not take a value for a key", () => expect(keyLine('{"a": "b", "c": 1}', "b")).toBe(0));
  it("reads a key with a dot or another special character as plain text", () => {
    expect(keyLine('{"a.b": 1}', "a.b")).toBe(1);
    expect(keyLine('{"axb": 1}', "a.b")).toBe(0);
  });
});

describe("isObject and isArray", () => {
  it("tell an object from an array, a value and nothing", () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isObject(undefined)).toBe(false);
    expect(isObject("a")).toBe(false);
    expect(isArray([])).toBe(true);
    expect(isArray({})).toBe(false);
    expect(isArray(undefined)).toBe(false);
  });
});
