import { describe, expect, it } from "vitest";
import { AROUND_ORDERS, DEFAULT_AROUND_ORDER, NO_AROUND_FILTER, aroundOrderLabel, filterAround, isAroundOrder, isFiltered, orderAround, toggleTag } from "./aroundFilter";
import type { AroundMember } from "./aroundSearch";
import { lintFrench } from "./typography";

const m = (id: string, name: string | null, metres: number, tag: AroundMember["tag"], direction: AroundMember["direction"] = "N", over: Partial<AroundMember> = {}): AroundMember => ({
  id, name, tag, category: "cafe", address: "1 Main Street", metres, direction, ...over,
});
const list: AroundMember[] = [
  m("a", "Café du Coin", 40, "no", "N", { address: "12 Rue Saint-Denis" }),
  m("b", "Bakery", 90, "yes", "E", { category: "fast_food" }),
  m("c", null, 130, "unknown", "S", { category: null, address: null }),
  m("d", "Library Annex", 220, "limited", "W", { category: "library" }),
  m("e", "Zed's", 220, "yes", null, { category: "shop" }),
];

describe("orders", () => {
  it("has three, nearest first by default", () => {
    expect([...AROUND_ORDERS]).toEqual(["distance", "name", "tag"]);
    expect(DEFAULT_AROUND_ORDER).toBe("distance");
  });
  it("recognises only those three", () => {
    for (const o of AROUND_ORDERS) expect(isAroundOrder(o)).toBe(true);
    for (const bad of ["", "random", null, undefined, 3, "Distance"]) expect(isAroundOrder(bad)).toBe(false);
  });
  it("labels them in both languages, in clean French", () => {
    expect(AROUND_ORDERS.map((o) => aroundOrderLabel(o, "en"))).toEqual(["Nearest first", "By name", "By wheelchair tag"]);
    for (const o of AROUND_ORDERS) expect(lintFrench(aroundOrderLabel(o, "fr"))).toEqual([]);
  });
});

describe("orderAround", () => {
  it("by distance keeps nearest first and breaks the tie by name", () => {
    expect(orderAround([...list].reverse(), "distance").map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("by name sorts ignoring case and accents, with the unnamed last", () => {
    expect(orderAround(list, "name").map((x) => x.id)).toEqual(["b", "a", "d", "e", "c"].filter(Boolean));
  });
  it("by tag follows the page's tag order and then distance", () => {
    expect(orderAround(list, "tag").map((x) => x.id)).toEqual(["b", "e", "d", "a", "c"]);
  });
  it("does not change the list it was given", () => {
    const before = list.map((x) => x.id);
    orderAround(list, "name");
    orderAround(list, "tag");
    expect(list.map((x) => x.id)).toEqual(before);
  });
  it("gives the same order whatever order it receives", () => {
    for (const o of AROUND_ORDERS) expect(orderAround([...list].reverse(), o)).toEqual(orderAround(list, o));
  });
});

describe("filterAround", () => {
  it("keeps everything with no filter", () => {
    expect(filterAround(list, NO_AROUND_FILTER)).toEqual(list);
    expect(isFiltered(NO_AROUND_FILTER)).toBe(false);
  });
  it("keeps the chosen tags, any of them", () => {
    expect(filterAround(list, { ...NO_AROUND_FILTER, tags: ["yes"] }).map((x) => x.id)).toEqual(["b", "e"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, tags: ["yes", "no"] }).map((x) => x.id)).toEqual(["a", "b", "e"]);
  });
  it("keeps UNKNOWN places when asked for them, and only then hides them", () => {
    expect(filterAround(list, { ...NO_AROUND_FILTER, tags: ["unknown"] }).map((x) => x.id)).toEqual(["c"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, tags: ["yes"] }).some((x) => x.tag === "unknown")).toBe(false);
  });
  it("keeps one direction, including none for the same spot being left out", () => {
    expect(filterAround(list, { ...NO_AROUND_FILTER, direction: "E" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, direction: "N" }).map((x) => x.id)).toEqual(["a"]);
  });
  it("matches a word prefix in the name, ignoring case and accents", () => {
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "cafe" }).map((x) => x.id)).toEqual(["a"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "CAFÉ du" }).map((x) => x.id)).toEqual(["a"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "lib" }).map((x) => x.id)).toEqual(["d"]);
  });
  it("matches the address and the kind as well, reading underscores as spaces", () => {
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "saint-denis" }).map((x) => x.id)).toEqual(["a"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "fast food" }).map((x) => x.id)).toEqual(["b"]);
  });
  it("needs every word to match", () => {
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "library annex" }).map((x) => x.id)).toEqual(["d"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "library bakery" })).toEqual([]);
  });
  it("does not match the middle of a word, and takes one letter as a whole word", () => {
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "akery" })).toEqual([]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "z" })).toEqual([]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "s" }).map((x) => x.id)).toEqual(["e"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "zed" }).map((x) => x.id)).toEqual(["e"]);
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "b" })).toEqual([]);
  });
  it("combines tag, direction and words", () => {
    const f = { query: "bakery", tags: ["yes" as const], direction: "E" as const };
    expect(filterAround(list, f).map((x) => x.id)).toEqual(["b"]);
    expect(filterAround(list, { ...f, direction: "W" })).toEqual([]);
  });
  it("treats a blank query as no query", () => {
    expect(filterAround(list, { ...NO_AROUND_FILTER, query: "   " })).toEqual(list);
    expect(isFiltered({ ...NO_AROUND_FILTER, query: "  " })).toBe(false);
  });
  it("counts any narrowing as a filter", () => {
    expect(isFiltered({ ...NO_AROUND_FILTER, query: "x" })).toBe(true);
    expect(isFiltered({ ...NO_AROUND_FILTER, tags: ["no"] })).toBe(true);
    expect(isFiltered({ ...NO_AROUND_FILTER, direction: "S" })).toBe(true);
  });
  it("does not change the distances or tags it passes through", () => {
    for (const x of filterAround(list, { ...NO_AROUND_FILTER, tags: ["yes"] })) expect(x).toBe(list.find((y) => y.id === x.id));
  });
});

describe("toggleTag", () => {
  it("adds a tag that is not there and removes one that is", () => {
    expect(toggleTag([], "yes")).toEqual(["yes"]);
    expect(toggleTag(["yes", "no"], "yes")).toEqual(["no"]);
    expect(toggleTag(["no"], "limited")).toEqual(["no", "limited"]);
  });
  it("leaves the array it was given alone", () => {
    const tags = ["yes"] as const;
    toggleTag(tags, "no");
    expect(tags).toEqual(["yes"]);
  });
});
