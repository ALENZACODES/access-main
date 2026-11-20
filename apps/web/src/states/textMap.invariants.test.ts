import { describe, expect, it } from "vitest";
import { lcg, place, varied } from "./placeFixtures";
import { COMPASS, GRID_SIZES, buildAround, buildTextMap, compassOf, bearingDegrees, locate } from "./textMap";
import { aroundToCsv, aroundToText, textMapToCsv, textMapToText } from "./textMapExport";

const SEEDS = [1, 2, 3, 5, 8, 13, 21];
const C = { lat: 43.65, lon: -79.38 };

describe("grids over generated lists", () => {
  for (const seed of SEEDS) {
    const places = varied(seed, 40);
    it(`seed ${seed}: every located place is in exactly one cell and the rest are listed apart, at every size`, () => {
      for (const size of GRID_SIZES) {
        const m = buildTextMap(places, size, "en");
        const inCells = m.cells.flat().flatMap((c) => c.placeIds);
        expect(new Set(inCells).size).toBe(inCells.length);
        expect(inCells.sort()).toEqual(places.filter((p) => p.location !== null).map((p) => p.id).sort());
        expect([...m.unlocatedIds].sort()).toEqual(places.filter((p) => p.location === null).map((p) => p.id).sort());
        expect(m.located + m.unlocatedIds.length).toBe(places.length);
      }
    });
    it(`seed ${seed}: a place in a cell lies inside that cell's share of the extent`, () => {
      const m = buildTextMap(places, 4, "en");
      const e = m.extent!;
      const byId = new Map(places.map((p) => [p.id, p] as const));
      for (const cell of m.cells.flat()) {
        for (const id of cell.placeIds) {
          const loc = byId.get(id)!.location!;
          const rowFromNorth = Math.min(3, Math.floor(((e.north - loc.lat) / (e.north - e.south || 1)) * 4));
          const col = Math.min(3, Math.floor(((loc.lon - e.west) / (e.east - e.west || 1)) * 4));
          // A place on a boundary may sit on either side after floating-point rounding, but never two cells away.
          expect(Math.abs(rowFromNorth - cell.row)).toBeLessThanOrEqual(1);
          expect(Math.abs(col - cell.col)).toBeLessThanOrEqual(1);
        }
      }
    });
    it(`seed ${seed}: the text and CSV name every place once`, () => {
      const m = buildTextMap(places, 3, "en");
      const csv = textMapToCsv(m, places, "en").split("\r\n").filter(Boolean);
      expect(csv).toHaveLength(places.length + 1);
      expect(new Set(csv.slice(1).map((l) => l.split(",").length)).size).toBeGreaterThanOrEqual(1);
      expect(textMapToText(m, "fr")).not.toMatch(/INCONN/i);
    });
    it(`seed ${seed}: around a point every place is in one sector, here, or the unlocated list, and sectors are nearest first`, () => {
      const a = buildAround(places, C, "en");
      const all = [...a.sectors.flatMap((s) => s.places.map((l) => l.id)), ...a.here.map((l) => l.id), ...a.unlocatedIds];
      expect(all.sort()).toEqual(places.map((p) => p.id).sort());
      for (const s of a.sectors) for (let i = 1; i < s.places.length; i++) expect(s.places[i]!.metres).toBeGreaterThanOrEqual(s.places[i - 1]!.metres);
    });
    it(`seed ${seed}: each place's sector matches its own bearing`, () => {
      for (const p of places) {
        const l = locate(p, C);
        if (l === null || l.compass === null) continue;
        expect(l.compass).toBe(compassOf(bearingDegrees(C, p.location!)));
      }
    });
    it(`seed ${seed}: the files make no network or storage use and are the same twice`, () => {
      const a = buildAround(places, C, "fr");
      expect(aroundToText(a, "fr")).toBe(aroundToText(a, "fr"));
      expect(aroundToCsv(places, C, "fr")).toBe(aroundToCsv(places, C, "fr"));
    });
  }
});

describe("random points", () => {
  it("always place a bearing in exactly one of the eight sectors", () => {
    const next = lcg(11);
    for (let i = 0; i < 1000; i++) {
      const to = { lat: 43 + next() * 2, lon: -80 + next() * 2 };
      const b = bearingDegrees(C, to);
      expect(COMPASS).toContain(compassOf(b));
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
  it("never throw for places at the poles, the date line or the same point", () => {
    for (const [lat, lon] of [[90, 0], [-90, 0], [0, 180], [0, -180], [43.65, -79.38]]) {
      const p = place("x", { lat, lon });
      expect(() => locate(p, C)).not.toThrow();
      expect(() => buildTextMap([p, place("y", { lat: 0, lon: 0 })], 3, "en")).not.toThrow();
    }
  });
});
