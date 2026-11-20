import { describe, expect, it } from "vitest";
import { BAND_TAG_ORDER, filterByBand, NO_POINT_BAND } from "./packBands";
import { distanceMetres, type Point } from "./packGeo";
import { nearestByTag } from "./packNearest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";

const OSM = "OpenStreetMap, Geofabrik Ontario extract";
const R = 6_371_008.8;

/** A small seeded generator so a failing pack can be rebuilt from its seed. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const TAGS = ["yes", "limited", "no", "designated", "", "maybe", "UNKNOWN", undefined];
const CENTRES: Point[] = [
  { lat: 43.65, lon: -79.38 },
  { lat: 0, lon: 0 },
  { lat: -33.87, lon: 151.21 },
];

function randomPack(seed: number, size: number, centre: Point): PackPlaceRecord[] {
  const next = lcg(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const items = Array.from({ length: size }, (_, i) => {
    const hasPoint = next() >= 0.25;
    // Round distances to a few fixed values now and then so equal distances (ties) really happen.
    const metres = next() < 0.3 ? pick([100, 250, 500]) : Math.pow(10, 1.5 + next() * 3);
    return {
      id: `p${i}`,
      name: next() < 0.2 ? "" : pick(["Alpha", "alpha", "Écu", "Zed", "Mid"]),
      wheelchair: pick(TAGS),
      lat: hasPoint ? centre.lat + ((metres / R) * 180) / Math.PI : undefined,
      lon: hasPoint ? centre.lon : undefined,
      provenance: next() < 0.2 ? null : { source_name: OSM, licence: "ODbL-1.0", retrieved_at: "2026-11-01", tier: 0 },
    };
  });
  return [...parsePackPlaces(items).places];
}

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 2026];
const SIZES = [0, 1, 2, 5, 40, 250];

describe("nearest place per tag over generated packs", () => {
  for (const centre of CENTRES) {
    for (const seed of SEEDS) {
      for (const size of SIZES) {
        const places = randomPack(seed, size, centre);
        const label = `seed ${seed}, ${size} places, from ${centre.lat},${centre.lon}`;
        const result = nearestByTag(places, centre);

        it(`counts every place under one tag and every unmeasured place once (${label})`, () => {
          expect(result.rows.map((r) => r.tag)).toEqual([...BAND_TAG_ORDER]);
          expect(result.rows.reduce((n, r) => n + r.total, 0)).toBe(places.length);
          expect(result.unmeasured).toBe(filterByBand(places, centre, NO_POINT_BAND).length);
        });

        it(`names a place with that tag and a map point, and none is closer (${label})`, () => {
          for (const row of result.rows) {
            const measured = places.filter((p) => p.tag === row.tag && p.location !== null);
            if (measured.length === 0) {
              expect(row.nearest, row.tag).toBeNull();
              continue;
            }
            const best = Math.min(...measured.map((p) => distanceMetres(centre, p.location!)));
            expect(row.nearest!.metres, row.tag).toBe(best);
            const chosen = places.find((p) => p.id === row.nearest!.id)!;
            expect(chosen.tag).toBe(row.tag);
            expect(chosen.location).not.toBeNull();
          }
        });

        it(`gives the same answer however the places are ordered (${label})`, () => {
          expect(nearestByTag([...places].reverse(), centre)).toEqual(result);
          const rotated = [...places.slice(Math.floor(places.length / 2)), ...places.slice(0, Math.floor(places.length / 2))];
          expect(nearestByTag(rotated, centre)).toEqual(result);
        });
      }
    }
  }
});
