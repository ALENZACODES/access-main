import { describe, expect, it } from "vitest";
import { scattered, START_WEST } from "./outingFixtures";
import { OUTING_CSV_HEADER, outingToCsv, outingToGeoJson, outingToText } from "./outingExport";
import { buildOuting, moveStop, nearestOrder, orderFor, OUTING_MODES, reconcileOrder, reverseOrder } from "./outingPlan";
import { distanceMetres } from "./packGeo";

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 2026];
const SIZES = [0, 1, 2, 5, 12, 60];

describe("outings over generated sets", () => {
  for (const seed of SEEDS) {
    for (const size of SIZES) {
      const set = scattered(seed, size);
      const ids = set.map((p) => p.id);
      const label = `seed ${seed}, ${size} places`;
      for (const mode of OUTING_MODES) {
        for (const start of [null, START_WEST]) {
          const where = start === null ? "no start" : "start";
          const order = orderFor(mode, set, start, reconcileOrder(reverseOrder(ids), ids));
          const outing = buildOuting(set, order, start);

          it(`${mode}, ${where}: uses every place exactly once (${label})`, () => {
            expect([...order].sort()).toEqual([...ids].sort());
            expect(outing.stops.map((s) => s.id)).toEqual(order);
            expect(outing.stops.map((s) => s.position)).toEqual(ids.map((_, i) => i + 1));
          });

          it(`${mode}, ${where}: every known leg is the straight line between the two points (${label})`, () => {
            outing.stops.forEach((s, i) => {
              const from = i === 0 ? start : outing.stops[i - 1]!.point;
              if (s.legMetres === null) return;
              expect(from, s.id).not.toBeNull();
              expect(s.point, s.id).not.toBeNull();
              expect(s.legMetres).toBeCloseTo(distanceMetres(from!, s.point!), 6);
            });
          });

          it(`${mode}, ${where}: a leg is UNKNOWN only where an end is missing, or for the first stop with no start (${label})`, () => {
            outing.stops.forEach((s, i) => {
              const from = i === 0 ? start : outing.stops[i - 1]!.point;
              const noLegByDesign = i === 0 && start === null;
              const mustBeNull = noLegByDesign || from === null || s.point === null;
              expect(s.legMetres === null, `${s.id} at ${i}`).toBe(mustBeNull);
            });
          });

          it(`${mode}, ${where}: running totals never go down and the last one is the total (${label})`, () => {
            let last = 0;
            for (const s of outing.stops) {
              expect(s.totalMetres).toBeGreaterThanOrEqual(last);
              last = s.totalMetres;
            }
            expect(outing.totalMetres).toBeCloseTo(last, 6);
          });

          it(`${mode}, ${where}: the counts agree with the stops (${label})`, () => {
            const known = outing.stops.filter((s) => s.legMetres !== null).length;
            expect(outing.legsKnown).toBe(known);
            expect(outing.legCount).toBe(Math.max(0, size - (start === null ? 1 : 0)));
            expect(outing.unlocated).toBe(set.filter((p) => p.point === null).length);
            expect(outing.complete).toBe(known === outing.legCount);
          });

          it(`${mode}, ${where}: the files agree with the stops (${label})`, () => {
            const rows = outingToCsv(outing).replace(/\r\n$/, "").split("\r\n");
            expect(rows).toHaveLength(size + 1);
            expect(rows[0]!.split(",")).toHaveLength(OUTING_CSV_HEADER.length);
            const geo = JSON.parse(outingToGeoJson(outing)) as { features: { properties: { id: string } }[]; unlocated: string[] };
            expect(geo.features.length + geo.unlocated.length).toBe(size);
            expect(geo.unlocated).toEqual(outing.stops.filter((s) => s.point === null).map((s) => s.id));
            for (const locale of ["en", "fr"] as const) {
              const text = outingToText(outing, locale, "2026-11-19", 3.5);
              expect(text.endsWith("\n© OpenStreetMap contributors\n")).toBe(true);
              expect(text).not.toMatch(/INCONN|NaN|undefined|null\b|\[object/);
            }
          });
        }
      }

      it(`nearest-next is the same whichever way round the places come in, once they are sorted by id (${label})`, () => {
        const sorted = [...set].sort((a, b) => (a.id < b.id ? -1 : 1));
        const shuffled = [...set].reverse().sort((a, b) => (a.id < b.id ? -1 : 1));
        expect(nearestOrder(shuffled, START_WEST)).toEqual(nearestOrder(sorted, START_WEST));
      });

      it(`moving a stop and moving it back gives the same order, and reversing twice does too (${label})`, () => {
        if (size < 2) return;
        const order = orderFor("added", set, null, []);
        const there = moveStop(order, order[1]!, -1);
        expect(there.moved).toBe(true);
        expect(there.moved && moveStop(there.order, order[1]!, 1).order).toEqual(order);
        expect(reverseOrder(reverseOrder(order))).toEqual(order);
      });
    }
  }

  it("nearest-next never has a longer first leg than going to any other located place first", () => {
    for (const seed of SEEDS) {
      const set = scattered(seed, 30);
      const outing = buildOuting(set, nearestOrder(set, START_WEST), START_WEST);
      const first = outing.stops[0]!;
      if (first.point === null) continue;
      for (const p of set) if (p.point !== null) expect(first.legMetres!).toBeLessThanOrEqual(distanceMetres(START_WEST, p.point) + 1e-6);
    }
  });
});
