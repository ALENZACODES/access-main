import { describe, expect, it } from "vitest";
import { MAX_DEPTH, MAX_NODES, isRecord, parseJson, walkPack } from "./pkWalk";

describe("walkPack: texts", () => {
  it("lists each text with its path and key, in the order written", () => {
    const w = walkPack({ a: "x", b: { c: "y" }, d: ["z", "w"] });
    expect(w.leaves.map((l) => [l.path, l.key, l.text])).toEqual([["a", "a", "x"], ["b.c", "c", "y"], ["d[0]", "d", "z"], ["d[1]", "d", "w"]]);
  });
  it("writes the path of a text in a list of objects", () => {
    const w = walkPack({ places: [{ name: "A" }, { name: "B", provenance: { source_url: "u" } }] });
    expect(w.leaves.map((l) => l.path)).toEqual(["places[0].name", "places[1].name", "places[1].provenance.source_url"]);
  });
  it("gives a text at the top, with an empty path and key", () => expect(walkPack("hello").leaves).toEqual([{ path: "", key: "", text: "hello", lang: null }]));
  it("lists an empty text, and does not list numbers, booleans or nulls as texts", () => {
    const w = walkPack({ a: "", b: 1, c: true, d: null });
    expect(w.leaves.map((l) => l.path)).toEqual(["a"]);
  });
  it("gives nothing for a value with no text", () => expect(walkPack([1, 2, null]).leaves).toEqual([]));
  it("reads a nested list", () => expect(walkPack({ a: [["x"], ["y"]] }).leaves.map((l) => l.path)).toEqual(["a[0][0]", "a[1][0]"]));
});

describe("walkPack: language", () => {
  it("takes the language from a key named en or fr, and keeps it for what is inside", () => {
    const w = walkPack({ name: { en: "Emergency", fr: "Urgence" }, how: { fr: ["a", "b"] } });
    expect(w.leaves.map((l) => [l.path, l.lang])).toEqual([["name.en", "en"], ["name.fr", "fr"], ["how.fr[0]", "fr"], ["how.fr[1]", "fr"]]);
  });
  it("takes the language of a text from a sibling named <key>_language", () => {
    const w = walkPack({ operator_text: "Elevator out", operator_text_language: "en", station: "Cedarvale" });
    expect(w.leaves.find((l) => l.key === "operator_text")?.lang).toBe("en");
    expect(w.leaves.find((l) => l.key === "station")?.lang).toBeNull();
  });
  it("does not take a language that is not en or fr", () => expect(walkPack({ t: "x", t_language: "de" }).leaves.find((l) => l.key === "t")?.lang).toBeNull());
  it("gives no language to a text outside every language key", () => expect(walkPack({ id: "a", address: "1 Main St" }).leaves.map((l) => l.lang)).toEqual([null, null]));
  it("keeps the language of the key for the object inside it, not for its neighbours", () => {
    const w = walkPack({ fr: { x: "a" }, other: { x: "b" } });
    expect(w.leaves.map((l) => l.lang)).toEqual(["fr", null]);
  });
});

describe("walkPack: numbers, nulls and limits", () => {
  it("lists numbers with their path and key", () => expect(walkPack({ lat: 43.6, p: [{ lon: -79.3 }] }).numbers).toEqual([{ path: "lat", key: "lat", value: 43.6 }, { path: "p[0].lon", key: "lon", value: -79.3 }]));
  it("lists the paths of nulls", () => expect(walkPack({ url: null, a: { b: null } }).nulls).toEqual(["url", "a.b"]));
  it("is not truncated for an ordinary value", () => expect(walkPack({ a: ["x"] }).truncated).toBe(false));
  it("stops at the depth limit and says so", () => {
    let v: unknown = "deep";
    for (let i = 0; i < MAX_DEPTH + 3; i += 1) v = { k: v };
    const w = walkPack(v);
    expect(w.truncated).toBe(true);
    expect(w.leaves).toEqual([]);
  });
  it("reads a value exactly at the depth limit", () => {
    let v: unknown = "deep";
    for (let i = 0; i < MAX_DEPTH; i += 1) v = { k: v };
    expect(walkPack(v).leaves).toHaveLength(1);
  });
  it("stops at the size limit and says so", () => {
    const w = walkPack(Array.from({ length: MAX_NODES + 10 }, () => "x"));
    expect(w.truncated).toBe(true);
    expect(w.leaves.length).toBeLessThanOrEqual(MAX_NODES);
  });
  it("does not throw on a value with a key named like an object method", () => expect(() => walkPack({ constructor: "a", __proto__x: "b", toString: "c" })).not.toThrow());
});

describe("parseJson and isRecord", () => {
  it("parses JSON", () => expect(parseJson('{"a":[1]}')).toEqual({ a: [1] }));
  it("gives null for text that is not JSON", () => {
    for (const t of ["", "{", "nope", "{'a':1}", "[1,]"]) expect(parseJson(t)).toBeNull();
  });
  it("gives null for the JSON text null as well, so the two are told apart by the caller's check", () => expect(parseJson("null")).toBeNull());
  it("says what is a record", () => {
    expect(isRecord({})).toBe(true);
    for (const v of [null, [], "x", 1, undefined]) expect(isRecord(v)).toBe(false);
  });
});
