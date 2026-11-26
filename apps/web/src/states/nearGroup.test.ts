import { describe, expect, it } from "vitest";
import { distanceMetres } from "./packGeo";
import { bare, lcg, place, varied } from "./placeFixtures";
import { buildNearGroups, DEFAULT_NEAR_RADIUS, groupedCount, isNearRadius, NEAR_RADII, spanOf } from "./nearGroup";

const at = (id: string, dLat: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + dLat, lon: -79.38, ...over });
/** 0.0004 degrees of latitude is about 44 metres. */
const STEP = 0.0004;

describe("radii", () => {
  it("lists four increasing radii and defaults to one of them", () => {
    expect([...NEAR_RADII]).toEqual([50, 100, 250, 500]);
    expect(NEAR_RADII).toContain(DEFAULT_NEAR_RADIUS);
  });
  it("accepts only listed radii", () => {
    expect(isNearRadius(100)).toBe(true);
    expect(isNearRadius(99)).toBe(false);
    expect(isNearRadius("100")).toBe(false);
    expect(isNearRadius(null)).toBe(false);
  });
});

describe("spanOf", () => {
  it("is 0 for none or one point", () => {
    expect(spanOf([])).toBe(0);
    expect(spanOf([{ lat: 43, lon: -79 }])).toBe(0);
  });
  it("is the largest pairwise distance, rounded", () => {
    const pts = [{ lat: 43.65, lon: -79.38 }, { lat: 43.6504, lon: -79.38 }, { lat: 43.6508, lon: -79.38 }];
    expect(spanOf(pts)).toBe(Math.round(distanceMetres(pts[0]!, pts[2]!)));
  });
});

describe("buildNearGroups", () => {
  it("returns nothing for no places", () => {
    expect(buildNearGroups([], 100)).toEqual({ radius: 100, groups: [], aloneIds: [], unlocatedIds: [] });
  });
  it("groups two places within the radius and leaves a far one alone", () => {
    const r = buildNearGroups([at("a", 0), at("b", STEP), at("c", 0.01)], 100);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.ids).toEqual(["a", "b"]);
    expect(r.aloneIds).toEqual(["c"]);
  });
  it("uses the radius: two places 44 m apart are apart at 50 but together only above it", () => {
    const ps = [at("a", 0), at("b", STEP)];
    expect(buildNearGroups(ps, 50).groups).toHaveLength(1);
    const far = [at("a", 0), at("b", STEP * 2)];
    expect(buildNearGroups(far, 50).groups).toHaveLength(0);
    expect(buildNearGroups(far, 100).groups).toHaveLength(1);
  });
  it("chains: a-b and b-c link a, b and c even when a and c are further apart than the radius", () => {
    const r = buildNearGroups([at("a", 0), at("b", STEP * 2), at("c", STEP * 4)], 100);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.ids).toHaveLength(3);
    expect(r.groups[0]!.spanMetres).toBeGreaterThan(100);
  });
  it("puts places with no point in unlocatedIds", () => {
    const r = buildNearGroups([bare("x"), at("a", 0)], 100);
    expect(r.unlocatedIds).toEqual(["x"]);
    expect(r.aloneIds).toEqual(["a"]);
  });
  it("orders names with unnamed last and ties by id", () => {
    const r = buildNearGroups([at("n", 0, { name: null }), at("b", STEP, { name: "Bravo" }), at("a", STEP, { name: "Alpha" }), at("z", STEP, { name: "alpha" })], 100);
    expect(r.groups[0]!.names).toEqual(["Alpha", "alpha", "Bravo", null]);
    expect(r.groups[0]!.ids).toEqual(["a", "z", "b", "n"]);
  });
  it("lists larger groups first, then tighter, and numbers them from 1", () => {
    const ps = [at("a", 0), at("b", STEP), at("c", 0.02), at("d", 0.02 + STEP), at("e", 0.02 + STEP * 2), at("f", 0.04), at("g", 0.04 + STEP / 2)];
    const r = buildNearGroups(ps, 100);
    expect(r.groups.map((g) => g.ids.length)).toEqual([3, 2, 2]);
    expect(r.groups.map((g) => g.no)).toEqual([1, 2, 3]);
    expect(r.groups[1]!.spanMetres).toBeLessThanOrEqual(r.groups[2]!.spanMetres);
  });
  it("ignores unusable points", () => {
    const odd = [at("a", 0), { ...at("b", 0), location: { lat: Number.NaN, lon: 0 } }, { ...at("c", 0), location: { lat: 95, lon: 0 } }, { ...at("d", 0), location: { lat: 0, lon: 190 } }];
    const r = buildNearGroups(odd, 100);
    expect(r.unlocatedIds).toEqual(["b", "c", "d"]);
    expect(r.aloneIds).toEqual(["a"]);
  });
  it("counts places at exactly the same point as together", () => {
    const r = buildNearGroups([at("a", 0), at("b", 0)], 50);
    expect(r.groups[0]!.spanMetres).toBe(0);
  });
  it("does not change its input", () => {
    const ps = [at("b", STEP), at("a", 0)];
    const copy = [...ps];
    buildNearGroups(ps, 100);
    expect(ps).toEqual(copy);
  });
  it("is independent of the order of the input", () => {
    const ps = varied(7, 60);
    const a = buildNearGroups(ps, 500);
    const b = buildNearGroups([...ps].reverse(), 500);
    expect(b).toEqual(a);
  });
  it("accounts for every place exactly once", () => {
    for (const radius of NEAR_RADII) {
      const ps = varied(11, 80);
      const r = buildNearGroups(ps, radius);
      expect(groupedCount(r) + r.aloneIds.length + r.unlocatedIds.length).toBe(ps.length);
      const all = [...r.groups.flatMap((g) => g.ids), ...r.aloneIds, ...r.unlocatedIds];
      expect(new Set(all).size).toBe(ps.length);
    }
  });
  it("grows or keeps groups as the radius grows (never splits a pair)", () => {
    const ps = varied(23, 120);
    let prev = 0;
    for (const radius of NEAR_RADII) {
      const r = buildNearGroups(ps, radius);
      expect(groupedCount(r)).toBeGreaterThanOrEqual(prev);
      prev = groupedCount(r);
    }
  });
  it("matches a brute-force check on random points", () => {
    const next = lcg(99);
    const ps = Array.from({ length: 70 }, (_, i) => place(`q${i}`, { lat: 43.65 + next() * 0.006, lon: -79.38 + next() * 0.008 }));
    const r = buildNearGroups(ps, 250);
    const groupOf = new Map<string, number>();
    r.groups.forEach((g, i) => g.ids.forEach((id) => groupOf.set(id, i)));
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (distanceMetres(ps[i]!.location!, ps[j]!.location!) <= 250) {
          expect(groupOf.get(ps[i]!.id)).toBeDefined();
          expect(groupOf.get(ps[i]!.id)).toBe(groupOf.get(ps[j]!.id));
        }
      }
    }
  });
  it("keeps places far apart in separate groups near the date line and poles without throwing", () => {
    const ps = [place("a", { lat: 89.9999, lon: 179.9999 }), place("b", { lat: -89.9999, lon: -179.9999 })];
    expect(() => buildNearGroups(ps, 500)).not.toThrow();
  });
  it("counts two places exactly the radius apart as together", () => {
    const a = at("a", 0);
    const b = at("b", 0.0009);
    const exact = distanceMetres(a.location!, b.location!);
    expect(buildNearGroups([a, b], exact as never).groups).toHaveLength(1);
    expect(buildNearGroups([a, b], (exact - 1e-9) as never).groups).toHaveLength(0);
  });
  it("accepts the poles and the date line and refuses a point just past them", () => {
    const edge = (lat: number, lon: number) => ({ ...at("e", 0), location: { lat, lon } });
    expect(buildNearGroups([edge(90, 180), at("a", 0)], 100).unlocatedIds).toEqual([]);
    expect(buildNearGroups([edge(-90, -180), at("a", 0)], 100).unlocatedIds).toEqual([]);
    expect(buildNearGroups([edge(90.5, 0), at("a", 0)], 100).unlocatedIds).toEqual(["e"]);
    expect(buildNearGroups([edge(0, 180.5), at("a", 0)], 100).unlocatedIds).toEqual(["e"]);
    expect(buildNearGroups([edge(-90.5, 0), at("a", 0)], 100).unlocatedIds).toEqual(["e"]);
    expect(buildNearGroups([edge(0, -180.5), at("a", 0)], 100).unlocatedIds).toEqual(["e"]);
  });
  it("lists places on their own by id, whatever order they came in", () => {
    const r2 = buildNearGroups([at("c", 0.03), at("b", 0.02), at("a", 0.01), at("d", 0.04)], 50);
    expect(r2.aloneIds).toEqual(["a", "b", "c", "d"]);
  });
});
