import { describe, expect, it } from "vitest";
import { PACK_SORTS, THEN_SORTS, cleanThen, comparePlaces, sortPlaces } from "./packSort";
import { orderedToText, packSortStatus } from "./packSortCopy";
import { buildOrderTable, sortKeyText } from "./packSortKeys";
import { EMPTY_PACK_QUERY, packPlacesView } from "./packPlacesView";
import { PROV, lcg, place } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

const on = (date: string) => ({ ...PROV, retrieved_at: date });
const ids = (xs: readonly PackPlaceRecord[]) => xs.map((p) => p.id);
const ps = [
  place("a", { name: "Alpha", category: "cafe", address: "20 Dundas Street East", wheelchair: "no", provenance: on("2026-03-01") }),
  place("b", { name: "Bravo", category: "cafe", address: "5 Dundas Street East", wheelchair: "yes", provenance: on("2026-01-01") }),
  place("c", { name: "Charlie", category: "bar", address: "7 Queen Street West", wheelchair: "yes", provenance: on("2026-02-01") }),
  place("d", { name: "Delta", category: "cafe", address: "9 Queen Street West", wheelchair: "yes", provenance: on("2026-03-01") }),
  place("e", { name: "Echo", category: null, address: null, wheelchair: null, provenance: null }),
];

describe("the second order", () => {
  it("lists every order but the default", () => {
    expect([...THEN_SORTS]).toEqual(PACK_SORTS.filter((s) => s !== "default"));
    expect(THEN_SORTS).toHaveLength(7);
  });
  it("cleanThen keeps a real order and drops everything else", () => {
    expect(cleanThen("kind", "street")).toBe("street");
    expect(cleanThen("kind", "kind")).toBeNull();
    expect(cleanThen("kind", "default")).toBeNull();
    expect(cleanThen("kind", "nonsense")).toBeNull();
    expect(cleanThen("kind", null)).toBeNull();
    expect(cleanThen("kind", undefined)).toBeNull();
    expect(cleanThen("default", "name")).toBe("name");
  });
  it("breaks ties in the first order by the second", () => {
    expect(ids(sortPlaces(ps, "kind", null, "street"))).toEqual(["c", "b", "a", "d", "e"]);
  });
  it("kind then name falls back to the same list as kind alone", () => {
    expect(ids(sortPlaces(ps, "kind", null, "name"))).toEqual(ids(sortPlaces(ps, "kind")));
  });
  it("kind then newest puts the newest of each kind first", () => {
    expect(ids(sortPlaces(ps, "kind", null, "newest"))).toEqual(["c", "a", "d", "b", "e"]);
  });
  it("tag then oldest", () => {
    expect(ids(sortPlaces(ps, "tag", null, "oldest"))).toEqual(["b", "c", "d", "a", "e"]);
  });
  it("a second order never changes the sequence of the first order's values", () => {
    for (const first of THEN_SORTS) {
      const alone = sortPlaces(ps, first).map((p) => sortKeyText(first, p, "en"));
      for (const second of THEN_SORTS) expect(sortPlaces(ps, first, null, second).map((p) => sortKeyText(first, p, "en")), `${first} then ${second}`).toEqual(alone);
    }
  });
  it("a missing value in the second order is last among equals in the first", () => {
    const tied = [place("x", { category: "cafe", address: null, name: "A" }), place("y", { category: "cafe", address: "3 Main Street", name: "Z" })];
    expect(ids(sortPlaces(tied, "kind", null, "street"))).toEqual(["y", "x"]);
  });
  it("is the same whatever order the places arrive in", () => {
    const next = lcg(3);
    for (const first of THEN_SORTS) for (const second of THEN_SORTS) {
      const shuffled = [...ps].sort(() => next() - 0.5);
      expect(ids(sortPlaces(shuffled, first, null, second))).toEqual(ids(sortPlaces(ps, first, null, second)));
    }
  });
  it("without a second order, behaves as before", () => {
    for (const s of PACK_SORTS) expect(ids(sortPlaces(ps, s, null, null))).toEqual(ids(sortPlaces(ps, s)));
  });
  it("the default order's point still decides first", () => {
    const near = [place("p", { lat: 43.6501, lon: -79.38, name: "Zed" }), place("q", { lat: 43.7, lon: -79.38, name: "Aaa" })];
    expect(ids(sortPlaces(near, "default", { lat: 43.65, lon: -79.38 }, "name"))).toEqual(["p", "q"]);
  });
  it("the comparator stays consistent with a second order", () => {
    for (const first of THEN_SORTS) {
      const cmp = comparePlaces(first, null, "street");
      for (const a of ps) for (const b of ps) expect(Math.sign(cmp(a, b)) + Math.sign(cmp(b, a))).toBe(0);
    }
  });
});

describe("the view with a second order", () => {
  const ctx = { locale: "en" as const, today: "2026-11-20" };
  const view = (sort: (typeof PACK_SORTS)[number], then?: (typeof PACK_SORTS)[number] | null) => packPlacesView(ps, 0, { ...EMPTY_PACK_QUERY, sort, then }, ctx).shownPlaces.map((p) => p.id);
  it("orders by both", () => expect(view("kind", "newest")).toEqual(["c", "a", "d", "b", "e"]));
  it("ignores a second order that equals the first or is the default", () => {
    expect(view("kind", "kind")).toEqual(view("kind"));
    expect(view("kind", "default")).toEqual(view("kind"));
    expect(view("kind", null)).toEqual(view("kind"));
  });
});

describe("the words and the table with a second order", () => {
  it("the status names both orders", () => {
    expect(packSortStatus("kind", 5, "en", "street")).toBe("Ordered by: Kind of place, then Street, then number. 5 places.");
    expect(packSortStatus("kind", 5, "fr", "tag")).toBe("Ordre\u00a0: Type de lieu, puis Étiquette fauteuil roulant. 5 lieux.");
  });
  it("the status is as before without one", () => expect(packSortStatus("kind", 5, "en", null)).toBe("Ordered by: Kind of place. 5 places."));
  it("the text file's status line names both", () => {
    expect(orderedToText(sortPlaces(ps, "kind", null, "street"), "kind", "en", "street")).toContain("Ordered by: Kind of place, then Street, then number. 5 places.");
  });
  it("the table has a column for the second order", () => {
    const t = buildOrderTable(sortPlaces(ps, "kind", null, "newest"), "kind", "en", 10, "newest");
    expect(t.thenHeading).toBe("Retrieved");
    expect(t.rows.map((r) => `${r.key}|${r.thenKey}`)).toEqual(["bar|1 February 2026", "cafe|1 March 2026", "cafe|1 March 2026", "cafe|1 January 2026", "UNKNOWN|UNKNOWN"]);
  });
  it("has no second column without one", () => {
    const t = buildOrderTable(ps, "kind", "en");
    expect(t.thenHeading).toBeNull();
    expect(t.rows.every((r) => r.thenKey === null)).toBe(true);
  });
});
