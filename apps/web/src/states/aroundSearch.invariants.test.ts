import { describe, expect, it } from "vitest";
import { AROUND_RADII, buildAround, centreChoices } from "./aroundSearch";
import { at } from "./aroundFixtures";
import { distanceMetres } from "./packGeo";
import { lcg } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

const TAGS = ["yes", "limited", "no", "designated", "UNKNOWN", null];

function scatter(seed: number, n: number): PackPlaceRecord[] {
  const next = lcg(seed);
  return Array.from({ length: n }, (_, i) => {
    const mapless = next() < 0.15;
    return at(`p${i}`, mapless ? null : (next() - 0.5) * 3000, mapless ? null : (next() - 0.5) * 3000, {
      name: next() < 0.2 ? null : `Name ${Math.floor(next() * 40)}`,
      wheelchair: TAGS[Math.floor(next() * TAGS.length)],
    });
  });
}

describe("buildAround on scattered places", () => {
  const places = scatter(11, 300);
  const centres = centreChoices(places).slice(0, 25);

  it("accounts for every other place exactly once", () => {
    for (const c of centres) {
      for (const r of AROUND_RADII) {
        const res = buildAround(places, c.id, r);
        if (res.status !== "ok") throw new Error("expected ok");
        expect(res.members.length + res.beyond + res.unmeasured + 1).toBe(places.length);
      }
    }
  });
  it("lists only places inside the radius, with the distance the haversine gives", () => {
    for (const c of centres) {
      const res = buildAround(places, c.id, 500);
      if (res.status !== "ok") throw new Error("expected ok");
      for (const m of res.members) {
        const p = places.find((x) => x.id === m.id)!;
        expect(m.metres).toBeCloseTo(distanceMetres(c.location!, p.location!), 6);
        expect(m.metres).toBeLessThanOrEqual(500);
      }
    }
  });
  it("misses no place that is inside the radius", () => {
    for (const c of centres.slice(0, 8)) {
      const res = buildAround(places, c.id, 500);
      if (res.status !== "ok") throw new Error("expected ok");
      const want = places.filter((p) => p.id !== c.id && p.location !== null && distanceMetres(c.location!, p.location) <= 500).map((p) => p.id);
      expect(res.members.map((m) => m.id).sort()).toEqual(want.sort());
    }
  });
  it("is sorted nearest first", () => {
    for (const c of centres) {
      const res = buildAround(places, c.id, 1000);
      if (res.status !== "ok") throw new Error("expected ok");
      for (let i = 1; i < res.members.length; i += 1) expect(res.members[i - 1]!.metres).toBeLessThanOrEqual(res.members[i]!.metres);
    }
  });
  it("only grows as the radius grows", () => {
    for (const c of centres) {
      let before = new Set<string>();
      for (const r of AROUND_RADII) {
        const res = buildAround(places, c.id, r);
        if (res.status !== "ok") throw new Error("expected ok");
        const now = new Set(res.members.map((m) => m.id));
        for (const id of before) expect(now.has(id)).toBe(true);
        before = now;
      }
    }
  });
  it("gives the same answer whatever order the places arrive in", () => {
    const shuffled = scatter(11, 300).reverse();
    for (const c of centres.slice(0, 10)) {
      expect(buildAround(shuffled, c.id, 500)).toEqual(buildAround(places, c.id, 500));
    }
  });
  it("is symmetric: if B is within r of A, A is within r of B at the same distance", () => {
    for (const a of centres.slice(0, 6)) {
      const res = buildAround(places, a.id, 500);
      if (res.status !== "ok") throw new Error("expected ok");
      for (const m of res.members.slice(0, 5)) {
        const back = buildAround(places, m.id, 500);
        if (back.status !== "ok") throw new Error("expected ok");
        const found = back.members.find((x) => x.id === a.id);
        expect(found).toBeDefined();
        expect(found!.metres).toBeCloseTo(m.metres, 6);
      }
    }
  });
  it("does not change the list it was given", () => {
    const copy = JSON.stringify(places);
    buildAround(places, centres[0]!.id, 1000);
    expect(JSON.stringify(places)).toBe(copy);
  });
});
