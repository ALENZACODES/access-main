import { describe, expect, it } from "vitest";
import { DEFAULT_PACK_SORT, PACK_SORTS, type PackSort, TAG_SORT_ORDER, compareByName, comparePlaces, isPackSort, runLabel, runsAreContiguous, sortPlaces, sortRuns } from "./packSort";
import type { PackPlaceRecord } from "./packPlaces";
import { PROV, lcg, place, varied } from "./placeFixtures";

const on = (date: string) => ({ ...PROV, retrieved_at: date });
const ids = (ps: readonly PackPlaceRecord[]) => ps.map((p) => p.id);
const P = {
  a: place("a", { name: "Alpha", category: "cafe", address: "20 Dundas Street East", wheelchair: "no", provenance: on("2026-03-01") }),
  b: place("b", { name: "bravo", category: "Fast_Food", address: "5 Dundas Street East", wheelchair: "yes", provenance: on("2026-01-01") }),
  c: place("c", { name: "Charlie", category: "cafe", address: "7 Queen Street West", wheelchair: "limited", provenance: on("2026-02-01") }),
  d: place("d", { name: "Éclair", category: null, address: null, wheelchair: "designated", provenance: null }),
  e: place("e", { name: null, category: "bar", address: "PO Box 12", wheelchair: null, provenance: on("2026-01-01") }),
  f: place("f", { name: "Delta", category: "bar", address: "100 Queen Street West", wheelchair: "yes", provenance: on("2026-04-01") }),
};
const all = Object.values(P);

describe("the list of orders", () => {
  it("has eight, starting with the default", () => {
    expect(PACK_SORTS).toHaveLength(8);
    expect(PACK_SORTS[0]).toBe(DEFAULT_PACK_SORT);
  });
  it("recognises only its own keys", () => {
    for (const s of PACK_SORTS) expect(isPackSort(s)).toBe(true);
    for (const v of ["", "Name", "nearest", null, undefined, 1, {}]) expect(isPackSort(v)).toBe(false);
  });
  it("lists tags in the pack's order with UNKNOWN last", () => expect([...TAG_SORT_ORDER]).toEqual(["yes", "limited", "no", "designated", "unknown"]));
});

describe("by name", () => {
  it("A to Z ignores case and accents, with an unnamed place last", () => {
    expect(ids(sortPlaces(all, "name"))).toEqual(["a", "b", "c", "f", "d", "e"]);
  });
  it("Z to A reverses the names but keeps the unnamed place last", () => {
    expect(ids(sortPlaces(all, "name-desc"))).toEqual(["d", "f", "c", "b", "a", "e"]);
  });
  it("breaks a tie by id, in both directions", () => {
    const twins = [place("t2", { name: "Same" }), place("t1", { name: "same" })];
    expect(ids(sortPlaces(twins, "name"))).toEqual(["t1", "t2"]);
    expect(ids(sortPlaces(twins, "name-desc"))).toEqual(["t1", "t2"]);
  });
  it("compareByName is the default order's tie-break", () => {
    expect(compareByName(P.a, P.b)).toBeLessThan(0);
    expect(compareByName(P.e, P.a)).toBeGreaterThan(0);
    expect(compareByName(P.a, P.a)).toBe(0);
  });
});

describe("by kind", () => {
  it("groups kinds that differ only in case or underscores, orders each kind by name, and puts no kind last", () => {
    expect(ids(sortPlaces(all, "kind"))).toEqual(["f", "e", "a", "c", "b", "d"]);
  });
  it("treats the word UNKNOWN and blank as no kind", () => {
    const ps = [place("x", { category: "UNKNOWN", name: "Aaa" }), place("y", { category: "  ", name: "Bbb" }), place("z", { category: "zoo", name: "Ccc" })];
    expect(ids(sortPlaces(ps, "kind"))).toEqual(["z", "x", "y"]);
  });
});

describe("by street", () => {
  it("orders by street, then by number, with no street last", () => {
    expect(ids(sortPlaces(all, "street"))).toEqual(["b", "a", "c", "f", "d", "e"]);
  });
  it("sorts numbers as numbers: 5 before 20 before 100", () => {
    const ps = [place("n100", { address: "100 Main Street", name: "A" }), place("n5", { address: "5 Main Street", name: "B" }), place("n20", { address: "20 Main Street", name: "C" })];
    expect(ids(sortPlaces(ps, "street"))).toEqual(["n5", "n20", "n100"]);
  });
  it("treats Ave and Avenue, St and Street as the same street", () => {
    const ps = [place("p", { address: "9 King St", name: "Z" }), place("q", { address: "3 King Street", name: "Y" })];
    expect(ids(sortPlaces(ps, "street"))).toEqual(["q", "p"]);
  });
  it("puts a place with a street but no number after those with one", () => {
    const ps = [place("w", { address: "Main Street", name: "A" }), place("v", { address: "4 Main Street", name: "B" })];
    expect(ids(sortPlaces(ps, "street"))).toEqual(["v", "w"]);
  });
});

describe("by tag", () => {
  it("lists Yes, Limited, No, Designated, then UNKNOWN", () => {
    expect(ids(sortPlaces(all, "tag"))).toEqual(["b", "f", "c", "a", "d", "e"]);
  });
  it("orders places with the same tag by name", () => {
    expect(ids(sortPlaces(all, "tag")).slice(0, 2)).toEqual(["b", "f"]);
  });
  it("a place whose tag has no source is UNKNOWN even when the pack says Designated, so it is last", () => {
    expect(P.d.tag).toBe("unknown");
    const ps = [P.d, place("h", { wheelchair: "no", name: "Zed" })];
    expect(ids(sortPlaces(ps, "tag"))).toEqual(["h", "d"]);
  });
  it("lists Designated after No and before UNKNOWN", () => {
    const ps = [place("u", { wheelchair: null, name: "A" }), place("g", { wheelchair: "designated", name: "B" }), place("h", { wheelchair: "no", name: "C" })];
    expect(ids(sortPlaces(ps, "tag"))).toEqual(["h", "g", "u"]);
  });
  it("treats a tag that is not recognised as UNKNOWN, so last", () => {
    const ps = [place("u", { wheelchair: "weird", name: "A" }), place("v", { wheelchair: "no", name: "B" })];
    expect(ids(sortPlaces(ps, "tag"))).toEqual(["v", "u"]);
  });
});

describe("by date retrieved", () => {
  it("oldest first with no date last", () => {
    expect(ids(sortPlaces(all, "oldest"))).toEqual(["b", "e", "c", "a", "f", "d"]);
  });
  it("newest first with no date still last", () => {
    expect(ids(sortPlaces(all, "newest"))).toEqual(["f", "a", "c", "b", "e", "d"]);
  });
  it("breaks a tie by name", () => {
    expect(ids(sortPlaces(all, "oldest")).slice(0, 2)).toEqual(["b", "e"]);
  });
});

describe("the default order", () => {
  it("is by name with no point", () => expect(ids(sortPlaces(all))).toEqual(ids(sortPlaces(all, "name"))));
  it("puts the nearest first when a point is given, then a place with no map point after, by name", () => {
    const ps = [place("far", { name: "Far", lat: 43.7, lon: -79.38 }), place("near", { name: "Zed", lat: 43.6501, lon: -79.38 }), place("none", { name: "Aaa", lat: null, lon: null })];
    expect(ids(sortPlaces(ps, "default", { lat: 43.65, lon: -79.38 }))).toEqual(["near", "far", "none"]);
  });
  it("ignores the point for every other order", () => {
    const from = { lat: 43.65, lon: -79.38 };
    for (const s of PACK_SORTS.filter((x) => x !== "default")) expect(ids(sortPlaces(all, s, from))).toEqual(ids(sortPlaces(all, s)));
  });
});

describe("any order", () => {
  const data = varied(21, 120);
  const from = { lat: 43.65, lon: -79.38 };
  for (const s of PACK_SORTS) {
    it(`${s}: keeps every place once and does not change its input`, () => {
      const copy = [...data];
      const r = sortPlaces(data, s, from);
      expect(data).toEqual(copy);
      expect(ids(r).slice().sort()).toEqual(ids(data).slice().sort());
    });
    it(`${s}: does not depend on the order it is given`, () => {
      const next = lcg(9);
      const shuffled = [...data].sort(() => next() - 0.5);
      expect(ids(sortPlaces(shuffled, s, from))).toEqual(ids(sortPlaces(data, s, from)));
    });
    it(`${s}: is a consistent order (antisymmetric and transitive on a sample)`, () => {
      const cmp = comparePlaces(s, from);
      const sample = data.slice(0, 30);
      for (const a of sample) {
        expect(cmp(a, a)).toBe(0);
        for (const b of sample) expect(Math.sign(cmp(a, b))).toBe(-Math.sign(cmp(b, a)) || 0);
      }
      const sorted = [...sample].sort(cmp);
      for (let i = 0; i + 2 < sorted.length; i++) {
        expect(cmp(sorted[i]!, sorted[i + 1]!)).toBeLessThanOrEqual(0);
        expect(cmp(sorted[i]!, sorted[i + 2]!)).toBeLessThanOrEqual(0);
      }
    });
    it(`${s}: sorting twice gives the same list`, () => {
      const once = sortPlaces(data, s, from);
      expect(ids(sortPlaces(once, s, from))).toEqual(ids(once));
    });
  }
});

describe("runs", () => {
  const sorted = (s: PackSort) => sortPlaces(all, s);
  it("the default has none", () => expect(sortRuns(sorted("default"), "default", "en")).toEqual([]));
  it("name runs are first letters, with # for a non-letter and UNKNOWN for no name", () => {
    const r = sortRuns(sorted("name"), "name", "en");
    expect(r.map((x) => x.label)).toEqual(["A", "B", "C", "D", "E", "UNKNOWN"]);
    expect(sortRuns([place("n", { name: "123 Deli" })], "name", "en")[0]!.label).toBe("#");
  });
  it("kind runs merge kinds spelled differently and end with UNKNOWN", () => {
    const r = sortRuns(sorted("kind"), "kind", "en");
    expect(r.map((x) => `${x.label}:${x.count}`)).toEqual(["Bar:2", "Cafe:2", "Fast food:1", "UNKNOWN:1"]);
  });
  it("street runs use the street as shown", () => {
    const r = sortRuns(sorted("street"), "street", "en");
    expect(r.map((x) => `${x.label}:${x.count}`)).toEqual(["Dundas Street East:2", "Queen Street West:2", "UNKNOWN:2"]);
  });
  it("tag runs use the tag words in the language", () => {
    expect(sortRuns(sorted("tag"), "tag", "en").map((x) => x.label)).toEqual(["Yes", "Limited", "No", "UNKNOWN"]);
    expect(sortRuns(sorted("tag"), "tag", "fr").map((x) => x.label)).toEqual(["Oui", "Limité", "Non", "UNKNOWN"]);
  });
  it("date runs use the date in the language", () => {
    expect(sortRuns(sorted("oldest"), "oldest", "en").map((x) => x.label)).toEqual(["1 January 2026", "1 February 2026", "1 March 2026", "1 April 2026", "UNKNOWN"]);
    expect(sortRuns(sorted("oldest"), "oldest", "fr")[0]!.label).toBe("1er janvier 2026");
  });
  it("a run's ids are those places in list order and the counts add up", () => {
    for (const s of PACK_SORTS.filter((x) => x !== "default")) {
      const list = sorted(s);
      const r = sortRuns(list, s, "en");
      expect(r.flatMap((x) => x.ids)).toEqual(ids(list));
      expect(r.reduce((n, x) => n + x.count, 0)).toBe(list.length);
      expect(runsAreContiguous(r)).toBe(true);
    }
  });
  it("runsAreContiguous spots a value that is split in two", () => {
    expect(runsAreContiguous([{ label: "A", count: 1, ids: ["x"] }, { label: "B", count: 1, ids: ["y"] }, { label: "A", count: 1, ids: ["z"] }])).toBe(false);
  });
  it("runLabel is null only for the default", () => {
    expect(runLabel("default", P.a, "en")).toBeNull();
    for (const s of PACK_SORTS.filter((x) => x !== "default")) expect(runLabel(s, P.a, "en")).not.toBeNull();
  });
  it("an empty list has no runs", () => expect(sortRuns([], "kind", "en")).toEqual([]));
});
