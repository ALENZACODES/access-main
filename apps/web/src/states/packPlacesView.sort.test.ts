import { describe, expect, it } from "vitest";
import { EMPTY_PACK_QUERY, type PackQuery, packPlacesView } from "./packPlacesView";
import { PACK_SORTS, type PackSort, sortPlaces } from "./packSort";
import { PROV, place, varied } from "./placeFixtures";

const ctx = { locale: "en" as const, today: "2026-11-20" };
const on = (date: string) => ({ ...PROV, retrieved_at: date });
const ps = [
  place("a", { name: "Alpha", category: "cafe", address: "20 Dundas Street East", wheelchair: "no", provenance: on("2026-03-01"), lat: 43.7, lon: -79.38 }),
  place("b", { name: "Bravo", category: "bar", address: "5 Dundas Street East", wheelchair: "yes", provenance: on("2026-01-01"), lat: 43.6501, lon: -79.38 }),
  place("c", { name: "Charlie", category: "cafe", address: "7 Queen Street West", wheelchair: "yes", provenance: on("2026-02-01"), lat: null, lon: null }),
];
const view = (over: Partial<PackQuery> = {}) => packPlacesView(ps, 0, { ...EMPTY_PACK_QUERY, ...over }, ctx);
const shown = (v: ReturnType<typeof view>) => v.shownPlaces.map((p) => p.id);
const cards = (v: ReturnType<typeof view>) => (v.kind === "list" ? v.cards.map((c) => c.id) : []);

describe("the places view with an order", () => {
  it("keeps the old order when none is given", () => {
    expect(shown(view())).toEqual(["a", "b", "c"]);
    expect(shown(view({ sort: "default" }))).toEqual(["a", "b", "c"]);
  });
  it("keeps the old distance order when a point is typed", () => {
    const near = { status: "ok" as const, point: { lat: 43.65, lon: -79.38 } };
    expect(shown(view({ near }))).toEqual(["b", "a", "c"]);
    expect(shown(view({ near, sort: "default" }))).toEqual(["b", "a", "c"]);
  });
  it("lists cards in the same order as the places", () => {
    for (const sort of PACK_SORTS) expect(cards(view({ sort }))).toEqual(shown(view({ sort })));
  });
  it("orders by each rule", () => {
    expect(shown(view({ sort: "name-desc" }))).toEqual(["c", "b", "a"]);
    expect(shown(view({ sort: "kind" }))).toEqual(["b", "a", "c"]);
    expect(shown(view({ sort: "street" }))).toEqual(["b", "a", "c"]);
    expect(shown(view({ sort: "tag" }))).toEqual(["b", "c", "a"]);
    expect(shown(view({ sort: "oldest" }))).toEqual(["b", "c", "a"]);
    expect(shown(view({ sort: "newest" }))).toEqual(["a", "c", "b"]);
  });
  it("orders after the filters: a tag filter and an order together", () => {
    expect(shown(view({ tag: "yes", sort: "name-desc" }))).toEqual(["c", "b"]);
    expect(shown(view({ text: "dundas", sort: "oldest" }))).toEqual(["b", "a"]);
  });
  it("still shows a distance on each card when ordered by something else", () => {
    const v = view({ near: { status: "ok", point: { lat: 43.65, lon: -79.38 } }, sort: "name-desc" });
    expect(v.kind).toBe("list");
    if (v.kind === "list") expect(v.cards.find((c) => c.id === "b")!.distanceText).toMatch(/m/);
  });
  it("an order never changes how many places match or what the announcement says", () => {
    const base = view();
    for (const sort of PACK_SORTS) {
      const v = view({ sort });
      expect(v.count).toBe(base.count);
      expect(v.announcement).toBe(base.announcement);
    }
  });
  it("gives the same places the shared sort gives", () => {
    const data = varied(14, 80);
    for (const sort of PACK_SORTS as readonly PackSort[]) {
      const v = packPlacesView(data, 0, { ...EMPTY_PACK_QUERY, sort }, ctx);
      expect(v.shownPlaces.map((p) => p.id)).toEqual(sortPlaces(data, sort).map((p) => p.id));
    }
  });
  it("an empty result stays an empty result in any order", () => {
    for (const sort of PACK_SORTS) expect(view({ text: "zzzzzz", sort }).kind).toBe("empty");
  });
});
