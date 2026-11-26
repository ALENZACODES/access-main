import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { NEAR_RADII, buildNearGroups, groupedCount } from "./nearGroup";
import { buildNeighbours, groupMiddle } from "./nearNeighbour";
import { neighbourToCsv, neighbourToText } from "./nearNeighbourCopy";
import { nearCaveat, nearSummary, nearToCsv, nearToText } from "./nearCopy";
import { parsePackPlaces } from "./packPlaces";
import { distanceMetres } from "./packGeo";
import { lintFrench } from "./typography";

const places = parsePackPlaces((JSON.parse(contentText) as { places: unknown[] }).places).places;

describe("the shipped pack, grouped", () => {
  it("has places to group", () => expect(places.length).toBeGreaterThan(1));
  for (const radius of NEAR_RADII) {
    it(`accounts for every place once at ${radius} m`, () => {
      const r = buildNearGroups(places, radius);
      expect(groupedCount(r) + r.aloneIds.length + r.unlocatedIds.length).toBe(places.length);
    });
    it(`every group member has another member within ${radius} m, at ${radius} m`, () => {
      const r = buildNearGroups(places, radius);
      const byId = new Map(places.map((p) => [p.id, p] as const));
      for (const g of r.groups) {
        for (const id of g.ids) {
          const me = byId.get(id)!.location!;
          expect(g.ids.some((o) => o !== id && distanceMetres(me, byId.get(o)!.location!) <= radius)).toBe(true);
        }
      }
    });
    it(`an alone place has no other within ${radius} m`, () => {
      const r = buildNearGroups(places, radius);
      const byId = new Map(places.map((p) => [p.id, p] as const));
      for (const id of r.aloneIds) {
        for (const p of places) if (p.id !== id && p.location) expect(distanceMetres(byId.get(id)!.location!, p.location)).toBeGreaterThan(radius);
      }
    });
  }
  it("writes text and CSV for every radius without a lone surrogate, a tag or an invisible character", () => {
    for (const radius of NEAR_RADII) {
      const r = buildNearGroups(places, radius);
      for (const locale of ["en", "fr"] as const) {
        const text = nearToText(r, places, locale);
        expect(text).not.toMatch(/[\ud800-\udfff]|<|>|\u200b|\u2028|\u2029/);
        expect(nearToCsv(r, places, locale).split("\r\n").length).toBe(places.length + 2);
        expect(nearSummary(r, locale).length).toBeGreaterThan(10);
      }
      expect(lintFrench(`${nearSummary(r, "fr")} ${nearCaveat("fr")}`)).toEqual([]);
    }
  });
});

describe("the shipped pack, nearest places", () => {
  const n = buildNeighbours(places);
  const byId = new Map(places.map((p) => [p.id, p] as const));
  it("gives every located place one row", () => {
    expect(n.rows).toHaveLength(n.located);
    expect(n.located + n.unlocatedIds.length).toBe(places.length);
  });
  it("each row's neighbour is the true nearest place", () => {
    for (const row of n.rows) {
      const me = byId.get(row.id)!.location!;
      const best = Math.min(...places.filter((p) => p.id !== row.id && p.location).map((p) => distanceMetres(me, p.location!)));
      expect(row.metres).toBe(Math.round(best));
    }
  });
  it("counts agree with the groups: a place with a neighbour within r is in a group at r", () => {
    for (const c of n.counts) {
      const g = buildNearGroups(places, c.radius);
      expect(c.count).toBe(groupedCount(g));
    }
  });
  it("writes text and CSV in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(neighbourToText(n, NEAR_RADII, locale)).not.toMatch(/[\ud800-\udfff]|\u200b|\u2028|\u2029/);
      expect(neighbourToCsv(n, places, locale).split("\r\n")).toHaveLength(n.rows.length + n.unlocatedIds.length + 2);
    }
  });
  it("the middle of the whole pack is inside its bounding box", () => {
    const m = groupMiddle(places)!;
    const lats = places.map((p) => p.location!.lat);
    expect(m.lat).toBeGreaterThan(Math.min(...lats) - 1e-4);
    expect(m.lat).toBeLessThan(Math.max(...lats) + 1e-4);
  });
});
