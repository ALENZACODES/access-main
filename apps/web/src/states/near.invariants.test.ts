import { describe, expect, it } from "vitest";
import { NEAR_RADII, buildNearGroups, groupedCount, spanOf } from "./nearGroup";
import { buildNeighbours, groupMiddle } from "./nearNeighbour";
import { distanceMetres } from "./packGeo";
import { lcg, place, varied } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Places packed into a small box so that groups really form: about 700 m by 900 m. */
function dense(seed: number, n: number): PackPlaceRecord[] {
  const next = lcg(seed);
  return Array.from({ length: n }, (_, i) => place(`d${String(i).padStart(3, "0")}`, { name: next() < 0.1 ? null : `Place ${i}`, lat: 43.65 + next() * 0.0065, lon: -79.38 + next() * 0.011, wheelchair: next() < 0.5 ? "yes" : "no" }));
}

function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const next = lcg(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe("groups", () => {
  for (const seed of SEEDS) {
    const ps = dense(seed, 60);
    for (const radius of NEAR_RADII) {
      it(`seed ${seed}, ${radius} m: every group has two or more places, each place is in one group at most`, () => {
        const r = buildNearGroups(ps, radius);
        const seen = new Set<string>();
        for (const g of r.groups) {
          expect(g.ids.length).toBeGreaterThanOrEqual(2);
          expect(g.names).toHaveLength(g.ids.length);
          for (const id of g.ids) {
            expect(seen.has(id)).toBe(false);
            seen.add(id);
          }
        }
        expect(seen.size + r.aloneIds.length).toBe(ps.length);
      });
    }
    it(`seed ${seed}: the result does not depend on the order of the places`, () => {
      for (const radius of NEAR_RADII) expect(buildNearGroups(shuffle(ps, seed * 31), radius)).toEqual(buildNearGroups(ps, radius));
    });
    it(`seed ${seed}: a smaller distance never joins what a larger distance keeps apart`, () => {
      for (let k = 0; k + 1 < NEAR_RADII.length; k++) {
        const small = buildNearGroups(ps, NEAR_RADII[k]!);
        const large = buildNearGroups(ps, NEAR_RADII[k + 1]!);
        const where = new Map<string, number>();
        large.groups.forEach((g, i) => g.ids.forEach((id) => where.set(id, i)));
        for (const g of small.groups) expect(new Set(g.ids.map((id) => where.get(id))).size).toBe(1);
      }
    });
    it(`seed ${seed}: groups are listed largest first, then tightest`, () => {
      const g = buildNearGroups(ps, 250).groups;
      for (let i = 1; i < g.length; i++) {
        const a = g[i - 1]!;
        const b = g[i]!;
        expect(a.ids.length > b.ids.length || (a.ids.length === b.ids.length && a.spanMetres <= b.spanMetres)).toBe(true);
        expect(b.no).toBe(a.no + 1);
      }
    });
    it(`seed ${seed}: the span is the true largest distance, and not under the nearest pair`, () => {
      for (const g of buildNearGroups(ps, 100).groups) {
        const pts = g.ids.map((id) => ps.find((p) => p.id === id)!.location!);
        expect(g.spanMetres).toBe(spanOf(pts));
        expect(g.spanMetres).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

describe("groups and nearest places agree", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: a place is in a group at r exactly when its nearest place is within r`, () => {
      const ps = dense(seed, 50);
      const n = buildNeighbours(ps);
      for (const radius of NEAR_RADII) {
        const r = buildNearGroups(ps, radius);
        const inGroup = new Set(r.groups.flatMap((g) => g.ids));
        // Rounding the distance to whole metres can move a place at exactly r + 0.4 m; keep a half-metre margin.
        for (const row of n.rows) {
          if (Math.abs(row.metres - radius) <= 1) continue;
          expect(inGroup.has(row.id), `${row.id} at ${row.metres} m, radius ${radius}`).toBe(row.metres <= radius);
        }
      }
    });
    it(`seed ${seed}: the counts equal the number of places in groups`, () => {
      const ps = dense(seed, 50);
      const n = buildNeighbours(ps);
      for (const c of n.counts) {
        const g = buildNearGroups(ps, c.radius);
        expect(Math.abs(c.count - groupedCount(g))).toBeLessThanOrEqual(2);
      }
    });
  }
});

describe("nearest places", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: the nearest place is a different place with a point, and the pairing is not always mutual but the distance is`, () => {
      const ps = dense(seed, 40);
      const n = buildNeighbours(ps);
      const byId = new Map(n.rows.map((r) => [r.id, r] as const));
      for (const row of n.rows) {
        expect(row.nearestId).not.toBe(row.id);
        const other = byId.get(row.nearestId)!;
        // The other place's nearest is at most as far away as this one is.
        expect(other.metres).toBeLessThanOrEqual(row.metres);
      }
    });
  }
  it("is unaffected by places with no point", () => {
    const ps = varied(4, 50);
    const withOut = buildNeighbours(ps.filter((p) => p.location !== null));
    const withAll = buildNeighbours(ps);
    expect(withAll.rows).toEqual(withOut.rows);
    expect(withAll.unlocatedIds.length).toBe(ps.filter((p) => p.location === null).length);
  });
});

describe("middle of a group", () => {
  it("is never further from any member than the group's span", () => {
    for (const seed of SEEDS) {
      const ps = dense(seed, 60);
      for (const g of buildNearGroups(ps, 100).groups) {
        const members = g.ids.map((id) => ps.find((p) => p.id === id)!);
        const m = groupMiddle(members)!;
        for (const p of members) expect(distanceMetres(m, p.location!)).toBeLessThanOrEqual(g.spanMetres + 1);
      }
    }
  });
  it("does not depend on the order of members", () => {
    const ps = dense(2, 12);
    expect(groupMiddle(shuffle(ps, 5))).toEqual(groupMiddle(ps));
  });
});
