import { describe, expect, it } from "vitest";
import { helpTitleHints, placeNameHints, titledItems } from "./hints";
import type { PackPlaceRecord } from "./packPlaces";

const place = (id: string, name: string | null, tag: PackPlaceRecord["tag"] = "yes"): PackPlaceRecord => ({
  id, name, tag, tagUnknownReason: null, provenance: null, tier: null, category: null, address: null, note: null, location: null,
});

describe("placeNameHints", () => {
  const places = [place("a", "Union Station"), place("b", "Café du Coin"), place("c", null), place("d", "Bay Street Library")];
  it("suggests close names, with the pack's own spelling", () => {
    expect(placeNameHints("unoin station", places)).toEqual([{ key: "a", label: "Union Station" }]);
    expect(placeNameHints("cafee du coin", places)).toEqual([{ key: "b", label: "Café du Coin" }]);
  });
  it("never suggests a place the pack gives no name for", () => {
    expect(placeNameHints("unnamed", places)).toEqual([]);
    expect(placeNameHints("", places)).toEqual([]);
  });
  it("says nothing about accessibility: a hint is only a key and a label", () => {
    for (const hint of placeNameHints("union", places)) expect(Object.keys(hint).sort()).toEqual(["key", "label"]);
  });
  it("respects the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => place(String(i), `Union ${i}`));
    expect(placeNameHints("union", many, 2)).toHaveLength(2);
  });
});

describe("helpTitleHints", () => {
  const articles = [{ id: "1", title: "Using the App offline" }, { id: "2", title: "Choosing a language" }];
  it("suggests close article titles", () => {
    expect(helpTitleHints("languge", articles)).toEqual([{ key: "2", label: "Choosing a language" }]);
  });
  it("ignores items without a text title", () => {
    expect(helpTitleHints("offline", [{ id: "3", title: 5 as unknown as string }, ...articles])).toEqual([{ key: "1", label: "Using the App offline" }]);
  });
});

describe("titledItems", () => {
  it("keeps items with an id and a text title", () => {
    expect(titledItems([{ id: "a", title: "A" }, { id: 1, title: "B" }, { id: "c" }, null, "x", { id: "d", title: "  " }])).toEqual([{ id: "a", title: "A" }]);
  });
  it("reads a title given per language", () => {
    const items = [{ id: "h", title: { en: "Using the App", fr: "Utiliser l’App" } }];
    expect(titledItems(items, "fr")).toEqual([{ id: "h", title: "Utiliser l’App" }]);
    expect(titledItems(items)).toEqual([{ id: "h", title: "Using the App" }]);
    expect(titledItems([{ id: "h", title: { en: "Only English" } }], "fr")).toEqual([]);
  });
});
