import { describe, expect, it } from "vitest";
import { MAX_PICK_CHOICES, pickLabel, pickPlaces } from "./callScriptPick";
import { bare, place } from "./placeFixtures";

const set = [place("a", { name: "Café Étoile" }), place("b", { name: "Quesnel Library" }), place("c", { name: "Étoile Hall" }), bare("d"), place("e", { name: "Main Street Pharmacy" })];

describe("pickPlaces", () => {
  it("lists every named place for an empty query, never an unnamed one", () => {
    const r = pickPlaces(set, "");
    expect(r.shown.map((p) => p.id)).toEqual(["a", "b", "c", "e"]);
    expect(r.hidden).toBe(0);
    expect(r.total).toBe(4);
  });
  it("ignores case and accents in both the query and the name", () => {
    expect(pickPlaces(set, "ETOILE").shown.map((p) => p.id)).toEqual(["a", "c"]);
    expect(pickPlaces(set, "café").shown.map((p) => p.id)).toEqual(["a"]);
    expect(pickPlaces(set, "cafe").shown.map((p) => p.id)).toEqual(["a"]);
  });
  it("needs every word, in any order", () => {
    expect(pickPlaces(set, "library quesnel").total).toBe(1);
    expect(pickPlaces(set, "quesnel hall").total).toBe(0);
  });
  it("treats extra spaces as one", () => {
    expect(pickPlaces(set, "  main   street ").total).toBe(1);
  });
  it("matches a part of a word", () => {
    expect(pickPlaces(set, "ques").total).toBe(1);
  });
  it("says how many did not fit", () => {
    const many = Array.from({ length: 20 }, (_, i) => place(`m${i}`, { name: `Shop ${i}` }));
    const r = pickPlaces(many, "shop");
    expect(r.shown).toHaveLength(MAX_PICK_CHOICES);
    expect(r.hidden).toBe(12);
    expect(r.total).toBe(20);
    expect(pickPlaces(many, "shop", 3).shown).toHaveLength(3);
    expect(pickPlaces(many, "shop", 0).shown).toHaveLength(0);
    expect(pickPlaces(many, "shop", -2).hidden).toBe(20);
  });
  it("gives nothing for no places", () => {
    expect(pickPlaces([], "x")).toEqual({ shown: [], hidden: 0, total: 0 });
  });
});

describe("pickLabel", () => {
  it("is the name when it is the only one", () => {
    expect(pickLabel(set[0]!, set)).toBe("Café Étoile");
  });
  it("adds the address when two places share a name", () => {
    const two = [place("x", { name: "Cafe", address: "1 Elm Street" }), place("y", { name: "Cafe", address: "2 Oak Street" })];
    expect(pickLabel(two[0]!, two)).toBe("Cafe, 1 Elm Street");
    expect(pickLabel(two[1]!, two)).toBe("Cafe, 2 Oak Street");
  });
  it("stays the name when the twin has no address", () => {
    const two = [place("x", { name: "Cafe", address: null }), place("y", { name: "Cafe", address: "2 Oak Street" })];
    expect(pickLabel(two[0]!, two)).toBe("Cafe");
  });
});
