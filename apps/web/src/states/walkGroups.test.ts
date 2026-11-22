import { describe, expect, it } from "vitest";
import { distanceMetres } from "./packGeo";
import { lcg, place, varied } from "./placeFixtures";
import { DEFAULT_WALK_DISTANCE, MAX_GROUPED_PLACES, MAX_WIDTH_MEMBERS, WALK_DISTANCES_M, centreOf, groupPlaces, isWalkDistance, locatedPlaces } from "./walkGroups";

/** A place `east` metres east and `north` metres north of a fixed point in Toronto. */
const at = (id: string, east: number, north: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + north / 111_195, lon: -79.38 + east / (111_195 * Math.cos((43.65 * Math.PI) / 180)), ...over });

/** Reference grouping: compare every pair. */
function slow(places: ReturnType<typeof at>[], d: number): string[][] {
  const pts = places.filter((p) => p.location);
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) if (distanceMetres(pts[i]!.location!, pts[j]!.location!) <= d) parent[find(j)] = find(i);
  const by = new Map<number, string[]>();
  pts.forEach((p, i) => by.set(find(i), [...(by.get(find(i)) ?? []), p.id]));
  return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));
}
const ids = (g: ReturnType<typeof groupPlaces>) => g.groups.map((x) => x.members.map((m) => m.id).sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));

describe("distances", () => {
  it("offers three distances, the default among them", () => {
    expect(WALK_DISTANCES_M).toEqual([100, 200, 400]);
    expect(WALK_DISTANCES_M).toContain(DEFAULT_WALK_DISTANCE);
  });
  it("tells a distance from other values", () => {
    expect(isWalkDistance(200)).toBe(true);
    expect(isWalkDistance(150)).toBe(false);
    expect(isWalkDistance("200")).toBe(false);
  });
});

describe("locatedPlaces", () => {
  it("keeps places with a map point in pack order", () => {
    const l = locatedPlaces([at("a", 0, 0), place("b", { lat: null, lon: null }), at("c", 5, 5)]);
    expect(l.map((x) => x.place.id)).toEqual(["a", "c"]);
  });
});

describe("groupPlaces", () => {
  it("groups two places inside the distance and leaves a far one alone", () => {
    const g = groupPlaces([at("a", 0, 0), at("b", 80, 0), at("c", 900, 0)], 100);
    expect(ids(g)).toEqual([["a", "b"]]);
    expect(g.alone).toBe(1);
  });
  it("includes a place exactly at the distance and excludes one just past it", () => {
    const a = at("a", 0, 0);
    const b = at("b", 0, 100);
    const d = distanceMetres(a.location!, b.location!);
    expect(groupPlaces([a, b], d).groups).toHaveLength(1);
    expect(groupPlaces([a, b], d - 0.01).groups).toHaveLength(0);
  });
  it("joins a row end to end though its ends are further apart than the distance", () => {
    const row = [0, 90, 180, 270, 360].map((e, i) => at(`r${i}`, e, 0));
    const g = groupPlaces(row, 100);
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0]!.members).toHaveLength(5);
    expect(g.groups[0]!.widthM).toBeGreaterThan(300);
  });
  it("finds neighbours across a grid cell border in every direction", () => {
    for (const [e, n] of [[0, 99], [0, -99], [99, 0], [-99, 0], [70, 70], [-70, -70], [70, -70], [-70, 70]] as const) {
      expect(groupPlaces([at("a", 0, 0), at("b", e, n)], 100).groups, `${e},${n}`).toHaveLength(1);
    }
  });
  it("counts places without a point and keeps them out of every group", () => {
    const g = groupPlaces([at("a", 0, 0), at("b", 10, 0), place("c", { lat: null, lon: null })], 100);
    expect(g.withoutPoint).toBe(1);
    expect(g.groups[0]!.members.map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("is empty for no places, and for a distance that is not positive", () => {
    expect(groupPlaces([], 100)).toMatchObject({ groups: [], alone: 0, withoutPoint: 0 });
    expect(groupPlaces([at("a", 0, 0), at("b", 1, 0)], 0).groups).toEqual([]);
    expect(groupPlaces([at("a", 0, 0), at("b", 1, 0)], -5).groups).toEqual([]);
    expect(groupPlaces([at("a", 0, 0), at("b", 1, 0)], Number.NaN).groups).toEqual([]);
  });
  it("counts a lone place once, and every placed place once in total", () => {
    const ps = varied(3, 150);
    const g = groupPlaces(ps, 400);
    const grouped = g.groups.reduce((s, x) => s + x.members.length, 0);
    expect(grouped + g.alone + g.withoutPoint).toBe(ps.length);
  });
  it("names a group by its first place in pack order", () => {
    const g = groupPlaces([at("z", 0, 0), at("a", 10, 0)], 100);
    expect(g.groups[0]!.id).toBe("z");
  });
  it("lists groups in the pack order of their first places", () => {
    const g = groupPlaces([at("a", 0, 0), at("b", 5000, 0), at("c", 5, 0), at("d", 5010, 0)], 100);
    expect(g.groups.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("gives the same groups whatever order the places come in", () => {
    const rand = lcg(5);
    const ps = Array.from({ length: 60 }, (_, i) => at(`p${String(i).padStart(2, "0")}`, rand() * 1500, rand() * 1500));
    expect(ids(groupPlaces([...ps].reverse(), 200))).toEqual(ids(groupPlaces(ps, 200)));
  });
  it.each([100, 200, 400])("agrees with comparing every pair at %i metres", (d) => {
    const rand = lcg(d);
    const ps = Array.from({ length: 90 }, (_, i) => at(`p${String(i).padStart(2, "0")}`, rand() * 2500, rand() * 2500));
    expect(ids(groupPlaces(ps, d))).toEqual(slow(ps, d));
  });
  it("agrees with comparing every pair far from the equator, where degrees of longitude are short", () => {
    const rand = lcg(9);
    const ps = Array.from({ length: 60 }, (_, i) => place(`p${String(i).padStart(2, "0")}`, { lat: 68 + rand() * 0.02, lon: -100 + rand() * 0.06 }));
    expect(ids(groupPlaces(ps, 200))).toEqual(slow(ps, 200));
  });
  it("gives more groups, never fewer places in them, as the distance grows", () => {
    const rand = lcg(21);
    const ps = Array.from({ length: 80 }, (_, i) => at(`p${i}`, rand() * 3000, rand() * 3000));
    const grouped = (d: number) => groupPlaces(ps, d).groups.reduce((s, g) => s + g.members.length, 0);
    expect(grouped(100)).toBeLessThanOrEqual(grouped(200));
    expect(grouped(200)).toBeLessThanOrEqual(grouped(400));
  });
  it("puts the same coordinates in one group", () => {
    const g = groupPlaces([at("a", 0, 0), at("b", 0, 0), at("c", 0, 0)], 100);
    expect(g.groups[0]).toMatchObject({ spreadM: 0, widthM: 0 });
  });
  it("tallies the tags of the members", () => {
    const g = groupPlaces([at("a", 0, 0, { wheelchair: "yes" }), at("b", 10, 0, { wheelchair: "no" }), at("c", 20, 0, { wheelchair: "UNKNOWN" }), at("d", 30, 0, { wheelchair: "yes" })], 100);
    expect(g.groups[0]!.tags).toEqual({ yes: 2, limited: 0, no: 1, designated: 0, unknown: 1 });
  });
  it("reports a spread and a width for a group", () => {
    const g = groupPlaces([at("a", 0, 0), at("b", 60, 0)], 100).groups[0]!;
    expect(g.widthM).toBeGreaterThanOrEqual(59);
    expect(g.widthM).toBeLessThanOrEqual(61);
    expect(g.spreadM).toBeGreaterThanOrEqual(29);
    expect(g.spreadM).toBeLessThanOrEqual(31);
  });
  it("does not work out the width of a very large group", () => {
    const n = MAX_WIDTH_MEMBERS + 5;
    const ps = Array.from({ length: n }, (_, i) => at(`p${i}`, (i % 20) * 5, Math.floor(i / 20) * 5));
    const g = groupPlaces(ps, 100);
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0]!.widthM).toBeNull();
    expect(g.groups[0]!.spreadM).toBeGreaterThan(0);
  });
  it("cuts a list longer than the limit and says how many it left out", () => {
    const ps = Array.from({ length: MAX_GROUPED_PLACES + 3 }, (_, i) => at(`p${i}`, (i % 200) * 1000, Math.floor(i / 200) * 1000));
    const g = groupPlaces(ps, 100);
    expect(g.leftOut).toBe(3);
    expect(g.alone).toBe(MAX_GROUPED_PLACES);
  });
  it("handles a long list in a fraction of a second", () => {
    const rand = lcg(77);
    const ps = Array.from({ length: 5000 }, (_, i) => at(`p${i}`, rand() * 20_000, rand() * 20_000));
    const t = Date.now();
    groupPlaces(ps, 200);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});

describe("centreOf", () => {
  it("is the mean of the points", () => expect(centreOf([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }])).toEqual({ lat: 2, lon: 3 }));
  it("is 0,0 for no points", () => expect(centreOf([])).toEqual({ lat: 0, lon: 0 }));
  it("is the point itself for one", () => expect(centreOf([{ lat: 43.6, lon: -79.4 }])).toEqual({ lat: 43.6, lon: -79.4 }));
  it("keeps points either side of the 180th meridian together", () => {
    const c = centreOf([{ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }]);
    expect(Math.abs(Math.abs(c.lon) - 180)).toBeLessThan(0.001);
  });
});
