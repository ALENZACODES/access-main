import { describe, expect, it } from "vitest";
import { NEAR_RADII } from "./nearGroup";
import { buildNeighbours, groupMiddle } from "./nearNeighbour";
import { distanceMetres } from "./packGeo";
import { bare, lcg, place, varied } from "./placeFixtures";

const at = (id: string, dLat: number, dLon = 0, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + dLat, lon: -79.38 + dLon, ...over });
const STEP = 0.0004;

describe("buildNeighbours", () => {
  it("gives nothing for no places or one", () => {
    expect(buildNeighbours([])).toEqual({ rows: [], counts: NEAR_RADII.map((radius) => ({ radius, count: 0 })), located: 0, unlocatedIds: [] });
    const one = buildNeighbours([at("a", 0)]);
    expect(one.rows).toEqual([]);
    expect(one.located).toBe(1);
  });
  it("gives each place its nearest other place", () => {
    const n = buildNeighbours([at("a", 0), at("b", STEP), at("c", STEP * 6)]);
    const row = (id: string) => n.rows.find((r) => r.id === id)!;
    expect(row("a").nearestId).toBe("b");
    expect(row("b").nearestId).toBe("a");
    expect(row("c").nearestId).toBe("b");
  });
  it("gives the distance in whole metres and the direction the neighbour lies", () => {
    const n = buildNeighbours([at("a", 0), at("b", STEP)]);
    const a = n.rows.find((r) => r.id === "a")!;
    expect(a.metres).toBe(Math.round(distanceMetres({ lat: 43.65, lon: -79.38 }, { lat: 43.6504, lon: -79.38 })));
    expect(a.compass).toBe("N");
    expect(n.rows.find((r) => r.id === "b")!.compass).toBe("S");
  });
  it("gives no direction for places at the same spot", () => {
    const n = buildNeighbours([at("a", 0), at("b", 0)]);
    expect(n.rows.map((r) => r.compass)).toEqual([null, null]);
    expect(n.rows.map((r) => r.metres)).toEqual([0, 0]);
  });
  it("gives no direction under 5 m and a direction at 6 m", () => {
    expect(buildNeighbours([at("a", 0), at("b", 0.000027)]).rows[0]!.compass).toBeNull();
    expect(buildNeighbours([at("a", 0), at("b", 0.000054)]).rows[0]!.compass).toBe("N");
  });
  it("counts a place whose rounded distance is exactly the distance", () => {
    const a = at("a", 0);
    const b = at("b", 0.00045);
    expect(Math.round(distanceMetres(a.location!, b.location!))).toBe(50);
    expect(buildNeighbours([a, b]).counts[0]).toEqual({ radius: 50, count: 2 });
  });
  it("breaks a tie by the lower id", () => {
    const n = buildNeighbours([at("m", 0), at("z", STEP), at("a", -STEP)]);
    expect(n.rows.find((r) => r.id === "m")!.nearestId).toBe("a");
  });
  it("sorts rows nearest first, then by name", () => {
    const n = buildNeighbours([at("a", 0, 0, { name: "Alpha" }), at("b", STEP, 0, { name: "Bravo" }), at("c", 0.02, 0, { name: "Charlie" }), at("d", 0.02 + STEP, 0, { name: "Delta" })]);
    expect(n.rows.map((r) => r.metres)).toEqual([...n.rows.map((r) => r.metres)].sort((x, y) => x - y));
    expect(n.rows.slice(0, 2).map((r) => r.name)).toEqual(["Alpha", "Bravo"]);
  });
  it("puts unnamed places last among equals", () => {
    const n = buildNeighbours([at("a", 0, 0, { name: null }), at("b", STEP, 0, { name: "Bravo" })]);
    expect(n.rows.map((r) => r.name)).toEqual(["Bravo", null]);
  });
  it("sets aside places with no usable point and sorts their ids", () => {
    const n = buildNeighbours([bare("y"), at("a", 0), at("b", STEP), bare("x"), { ...at("c", 0), location: { lat: Number.NaN, lon: 0 } }]);
    expect(n.unlocatedIds).toEqual(["c", "x", "y"]);
    expect(n.located).toBe(2);
  });
  it("counts places that have a neighbour within each distance", () => {
    const n = buildNeighbours([at("a", 0), at("b", STEP), at("c", 0.01), at("d", 0.01 + STEP * 4)]);
    expect(n.counts.map((c) => c.radius)).toEqual([...NEAR_RADII]);
    expect(n.counts.map((c) => c.count)).toEqual([2, 2, 4, 4]);
  });
  it("counts never fall as the distance grows", () => {
    const c = buildNeighbours(varied(3, 90)).counts.map((x) => x.count);
    expect(c).toEqual([...c].sort((a, b) => a - b));
  });
  it("is independent of input order and does not change its input", () => {
    const ps = varied(17, 70);
    const copy = [...ps];
    const a = buildNeighbours(ps);
    expect(ps).toEqual(copy);
    expect(buildNeighbours([...ps].reverse())).toEqual(a);
  });
  it("matches a brute-force search on random points", () => {
    const next = lcg(5);
    const ps = Array.from({ length: 80 }, (_, i) => place(`q${i}`, { lat: 43.65 + next() * 0.02, lon: -79.38 + next() * 0.03 }));
    for (const row of buildNeighbours(ps).rows) {
      const me = ps.find((p) => p.id === row.id)!;
      const best = Math.min(...ps.filter((p) => p.id !== row.id).map((p) => distanceMetres(me.location!, p.location!)));
      expect(row.metres).toBe(Math.round(best));
      const named = ps.find((p) => p.id === row.nearestId)!;
      expect(distanceMetres(me.location!, named.location!)).toBeCloseTo(best, 6);
    }
  });
  it("gives a row to every located place when there are two or more", () => {
    const ps = varied(31, 60);
    const n = buildNeighbours(ps);
    expect(n.rows).toHaveLength(n.located);
    expect(n.located + n.unlocatedIds.length).toBe(ps.length);
  });
});

describe("groupMiddle", () => {
  it("is null when no place has a usable point", () => {
    expect(groupMiddle([])).toBeNull();
    expect(groupMiddle([bare("x")])).toBeNull();
  });
  it("is the place itself for one place", () => {
    expect(groupMiddle([at("a", 0)])).toEqual({ lat: 43.65, lon: -79.38 });
  });
  it("is the average of latitudes and of longitudes, to five decimals", () => {
    expect(groupMiddle([at("a", 0), at("b", 0.0002, 0.0004)])).toEqual({ lat: 43.6501, lon: -79.3798 });
    expect(groupMiddle([at("a", 0.000001), at("b", 0.000002)])).toEqual({ lat: 43.65, lon: -79.38 });
  });
  it("keeps five decimals and no more", () => {
    expect(groupMiddle([at("a", 0.000012)])).toEqual({ lat: 43.65001, lon: -79.38 });
    expect(groupMiddle([place("x", { lat: 43.123456, lon: -79.987654 })])).toEqual({ lat: 43.12346, lon: -79.98765 });
  });
  it("skips places with no point", () => {
    expect(groupMiddle([bare("x"), at("a", 0), at("b", 0.0002)])).toEqual({ lat: 43.6501, lon: -79.38 });
  });
  it("lies within the box of its places", () => {
    const ps = varied(9, 30).filter((p) => p.location);
    const m = groupMiddle(ps)!;
    const lats = ps.map((p) => p.location!.lat);
    const lons = ps.map((p) => p.location!.lon);
    expect(m.lat).toBeGreaterThanOrEqual(Math.min(...lats) - 1e-5);
    expect(m.lat).toBeLessThanOrEqual(Math.max(...lats) + 1e-5);
    expect(m.lon).toBeGreaterThanOrEqual(Math.min(...lons) - 1e-5);
    expect(m.lon).toBeLessThanOrEqual(Math.max(...lons) + 1e-5);
  });
});
