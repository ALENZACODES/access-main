import { describe, expect, it } from "vitest";
import { PACK_SORTS, type PackSort, comparePlaces, sortPlaces, sortRuns, runsAreContiguous } from "./packSort";
import { buildOrderTable, sortKeyText } from "./packSortKeys";
import { lcg, place, PROV } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

const SEEDS = [1, 2, 3, 4, 5, 6];
const NAMES = ["Alpha", "alpha", "Éclair", "Zed", "zebra", "123 Deli", "  Spaced", null, "Same", "Same"];
const KINDS = ["cafe", "Cafe", "fast_food", "fast food", "bar", null, "UNKNOWN", " "];
const STREETS = ["1 Main Street", "10 Main St", "2 Main Street", "5 Queen Street West", "Queen St W 7", "PO Box 4", null, "Unit 5", "100 King Street East"];
const TAGS = ["yes", "limited", "no", "designated", null, "weird"];
const DATES = ["2026-01-01", "2026-01-02", "2025-12-31", "2026-11-13", null];

/** Places with repeated and missing values, so ties and gaps are everywhere. */
function awkward(seed: number, n: number): PackPlaceRecord[] {
  const next = lcg(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  return Array.from({ length: n }, (_, i) => {
    const d = pick(DATES);
    return place(`z${String(i).padStart(3, "0")}`, {
      name: pick(NAMES),
      category: pick(KINDS),
      address: pick(STREETS),
      wheelchair: pick(TAGS),
      provenance: d === null ? null : { ...PROV, retrieved_at: d },
      lat: next() < 0.2 ? null : 43.6 + next() * 0.05,
      lon: next() < 0.2 ? null : -79.4 + next() * 0.05,
    });
  });
}
const ids = (xs: readonly PackPlaceRecord[]) => xs.map((p) => p.id);
const shuffle = <T,>(xs: readonly T[], seed: number): T[] => {
  const next = lcg(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

describe("orders on awkward data", () => {
  for (const seed of SEEDS) {
    const data = awkward(seed, 90);
    const from = { lat: 43.62, lon: -79.37 };
    for (const sort of PACK_SORTS) {
      it(`seed ${seed}, ${sort}: a total order, the same however the input is shuffled`, () => {
        const base = ids(sortPlaces(data, sort, from));
        expect(base).toHaveLength(data.length);
        expect(new Set(base).size).toBe(data.length);
        expect(ids(sortPlaces(shuffle(data, seed * 7 + 1), sort, from))).toEqual(base);
        expect(ids(sortPlaces(shuffle(data, seed * 13 + 5), sort, from))).toEqual(base);
      });
    }
  }
});

describe("missing values are always last", () => {
  const data = awkward(11, 120);
  const missing: Record<string, (p: PackPlaceRecord) => boolean> = {
    name: (p) => p.name === null,
    "name-desc": (p) => p.name === null,
    kind: (p) => sortKeyText("kind", p, "en") === "UNKNOWN",
    street: (p) => sortKeyText("street", p, "en") === "UNKNOWN",
    tag: (p) => p.tag === "unknown",
    oldest: (p) => p.provenance === null,
    newest: (p) => p.provenance === null,
  };
  for (const [sort, isMissing] of Object.entries(missing)) {
    it(`${sort}: no place with a value comes after a place without one`, () => {
      const r = sortPlaces(data, sort as PackSort);
      const flags = r.map(isMissing);
      const firstMissing = flags.indexOf(true);
      expect(firstMissing).toBeGreaterThanOrEqual(0);
      expect(flags.slice(firstMissing).every(Boolean), sort).toBe(true);
    });
  }
  it("default: places with no map point come after those with one when a point is typed", () => {
    const r = sortPlaces(data, "default", { lat: 43.62, lon: -79.37 });
    const flags = r.map((p) => p.location === null);
    expect(flags.slice(flags.indexOf(true)).every(Boolean)).toBe(true);
  });
});

describe("the values rise or fall the way the order says", () => {
  const data = awkward(4, 150);
  it("oldest: dates never fall", () => {
    const d = sortPlaces(data, "oldest").flatMap((p) => (p.provenance ? [p.provenance.retrievedOn] : []));
    expect(d).toEqual([...d].sort());
  });
  it("newest: dates never rise", () => {
    const d = sortPlaces(data, "newest").flatMap((p) => (p.provenance ? [p.provenance.retrievedOn] : []));
    expect(d).toEqual([...d].sort().reverse());
  });
  it("tag: the tag rank never falls", () => {
    const order = ["yes", "limited", "no", "designated"];
    const ranks = sortPlaces(data, "tag").filter((p) => p.tag !== "unknown").map((p) => order.indexOf(p.tag));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
  it("kind: kind keys never fall", () => {
    const keys = sortPlaces(data, "kind").map((p) => sortKeyText("kind", p, "en").toLowerCase().replace(/\s+/g, " ")).filter((k) => k !== "unknown");
    expect(keys).toEqual([...keys].sort());
  });
});

describe("groups on awkward data", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: every group order gives contiguous groups that add up`, () => {
      const data = awkward(seed + 20, 100);
      for (const sort of PACK_SORTS.filter((s) => s !== "default")) {
        const r = sortPlaces(data, sort);
        const runs = sortRuns(r, sort, "en");
        expect(runsAreContiguous(runs), sort).toBe(true);
        expect(runs.reduce((n, x) => n + x.count, 0)).toBe(data.length);
        expect(runs.flatMap((x) => x.ids)).toEqual(ids(r));
      }
    });
    it(`seed ${seed}: the order table matches the list and its key`, () => {
      const data = awkward(seed + 40, 60);
      for (const sort of PACK_SORTS) {
        const r = sortPlaces(data, sort);
        const t = buildOrderTable(r, sort, "en", 25);
        expect(t.rows.map((x) => x.id)).toEqual(ids(r).slice(0, 25));
        expect(t.rows.map((x) => x.key)).toEqual(r.slice(0, 25).map((p) => sortKeyText(sort, p, "en")));
      }
    });
  }
});

describe("the comparator", () => {
  it("is antisymmetric and reflexive on every pair of a sample, for every order", () => {
    const data = awkward(8, 24);
    for (const sort of PACK_SORTS) {
      const cmp = comparePlaces(sort, { lat: 43.62, lon: -79.37 });
      for (const a of data) {
        expect(cmp(a, a)).toBe(0);
        for (const b of data) expect(Math.sign(cmp(a, b)) + Math.sign(cmp(b, a))).toBe(0);
      }
    }
  });
  it("is transitive on every triple of a small sample", () => {
    const data = awkward(9, 14);
    for (const sort of PACK_SORTS) {
      const cmp = comparePlaces(sort, null);
      for (const a of data) for (const b of data) for (const c of data) if (cmp(a, b) <= 0 && cmp(b, c) <= 0) expect(cmp(a, c), sort).toBeLessThanOrEqual(0);
    }
  });
});
