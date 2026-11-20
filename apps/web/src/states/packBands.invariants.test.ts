import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { BAND_EDGES_M, BAND_KEYS, DISTANCE_BANDS, NO_POINT_BAND, bandOf, bandRange, buildBands, countWithin, filterByBand, placeBand } from "./packBands";
import { bandsToCsv, bandsToText } from "./packBandsExport";
import { distanceMetres, type Point } from "./packGeo";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { EMPTY_PACK_QUERY, packPlacesView } from "./packPlacesView";

const TODAY = "2026-11-19";
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
  { lat: 45.42, lon: -75.69 },
  { lat: 0, lon: 0 },
  { lat: -33.87, lon: 151.21 },
  { lat: 89.9, lon: 10 },
];

function randomPack(seed: number, size: number, centre: Point): PackPlaceRecord[] {
  const next = lcg(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const items = Array.from({ length: size }, (_, i) => {
    const hasPoint = next() >= 0.2;
    // Spread over a few hundred metres to tens of kilometres, so every band is likely to be used.
    const metres = Math.pow(10, 1.5 + next() * 3.5);
    const bearing = next() * 2 * Math.PI;
    return {
      id: `p${i}`,
      name: `Place ${i}`,
      wheelchair: pick(TAGS),
      lat: hasPoint ? Math.max(-90, Math.min(90, centre.lat + ((metres * Math.cos(bearing)) / R) * (180 / Math.PI))) : undefined,
      lon: hasPoint ? centre.lon + ((metres * Math.sin(bearing)) / (R * Math.max(0.01, Math.cos((centre.lat * Math.PI) / 180)))) * (180 / Math.PI) : undefined,
      provenance: next() < 0.2 ? null : { source_name: OSM, licence: "ODbL-1.0", retrieved_at: "2026-11-01", tier: 0 },
    };
  });
  return [...parsePackPlaces(items).places];
}

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 2026];
const SIZES = [0, 1, 2, 5, 40, 250];

describe("distance bands over generated packs", () => {
  for (const centre of CENTRES) {
    for (const seed of SEEDS) {
      for (const size of SIZES) {
        const places = randomPack(seed, size, centre);
        const label = `seed ${seed}, ${size} places, from ${centre.lat},${centre.lon}`;
        const rows = buildBands(places, centre);

        it(`puts every place in exactly one band (${label})`, () => {
          expect(rows.reduce((n, r) => n + r.total, 0)).toBe(places.length);
          expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
          for (const r of rows) expect(r.total).toBe(Object.values(r.byTag).reduce((a, b) => a + b, 0));
        });

        it(`lists the bands in the fixed order with no-point last (${label})`, () => {
          const order = rows.map((r) => BAND_KEYS.indexOf(r.key));
          expect([...order].sort((a, b) => a - b)).toEqual(order);
          expect(rows.filter((r) => r.key !== NO_POINT_BAND)).toHaveLength(DISTANCE_BANDS.length);
          const noPoint = places.filter((p) => p.location === null).length;
          expect(rows.find((r) => r.key === NO_POINT_BAND)?.total ?? 0).toBe(noPoint);
        });

        it(`puts a place in the band its own distance names (${label})`, () => {
          for (const p of places) {
            const band = placeBand(p, centre);
            if (p.location === null) {
              expect(band).toBe(NO_POINT_BAND);
              continue;
            }
            const d = distanceMetres(centre, p.location);
            const range = bandRange(band as (typeof DISTANCE_BANDS)[number]);
            expect(d).toBeGreaterThanOrEqual(range.from);
            if (range.to !== null) expect(d).toBeLessThan(range.to);
          }
        });

        it(`makes a filter that agrees with the table and loses nobody (${label})`, () => {
          let seen = 0;
          for (const r of rows) {
            const inBand = filterByBand(places, centre, r.key);
            expect(inBand).toHaveLength(r.total);
            seen += inBand.length;
          }
          expect(seen).toBe(places.length);
        });

        it(`counts within a distance the same as the bands below it add up to (${label})`, () => {
          let running = 0;
          for (let i = 0; i < BAND_EDGES_M.length; i++) {
            running += rows.find((r) => r.key === DISTANCE_BANDS[i])!.total;
            expect(countWithin(places, centre, BAND_EDGES_M[i]!), `edge ${BAND_EDGES_M[i]}`).toBe(running);
          }
        });

        it(`keeps the files and the table in step, and the typed point out of them (${label})`, () => {
          const csv = bandsToCsv(rows).split("\r\n");
          expect(csv).toHaveLength(rows.length + 2);
          const text = bandsToText(rows, "en", TODAY);
          for (const locale of ["en", "fr"] as const) {
            const t = bandsToText(rows, locale, TODAY);
            for (const line of t.split("\n")) if (!line.startsWith("©")) expect(lintCopy(line, locale), line).toEqual([]);
          }
          expect(text).not.toContain(String(centre.lat).replace("-", "").slice(0, 5) + "0000");
          expect(text.endsWith("\n© OpenStreetMap contributors\n")).toBe(true);
        });
      }
    }
  }
});

describe("the edges, built exactly", () => {
  const origin: Point = { lat: 43.65, lon: -79.38 };
  const at = (metres: number): Point => ({ lat: origin.lat + ((metres / R) * 180) / Math.PI, lon: origin.lon });
  it("places a point just inside and just outside each edge in the right bands", () => {
    for (let i = 0; i < BAND_EDGES_M.length; i++) {
      const edge = BAND_EDGES_M[i]!;
      expect(bandOf(distanceMetres(origin, at(edge - 1))), `${edge} - 1`).toBe(DISTANCE_BANDS[i]);
      expect(bandOf(distanceMetres(origin, at(edge + 1))), `${edge} + 1`).toBe(DISTANCE_BANDS[i + 1]);
    }
  });
  it("measures a point straight north as the distance it was placed at, to within a millimetre", () => {
    for (const m of [10, 250, 999, 4321, 12_000]) expect(distanceMetres(origin, at(m))).toBeCloseTo(m, 3);
  });
  it("makes the same bands whichever way round two points are compared", () => {
    for (const m of [100, 400, 900, 3000, 9000]) expect(bandOf(distanceMetres(origin, at(m)))).toBe(bandOf(distanceMetres(at(m), origin)));
  });
  it("keeps a place at the starting point itself in the nearest band", () => {
    expect(bandOf(distanceMetres(origin, origin))).toBe("lt250");
  });
});

describe("the list view with a distance band", () => {
  const centre: Point = { lat: 43.65, lon: -79.38 };
  const places = randomPack(5, 120, centre);
  const ctx = { locale: "en" as const, today: TODAY };
  const near = { status: "ok" as const, point: centre };
  const run = (band: (typeof BAND_KEYS)[number] | null, extra: Partial<typeof EMPTY_PACK_QUERY> = {}) => packPlacesView(places, 0, { ...EMPTY_PACK_QUERY, near, band, ...extra }, ctx);

  it("shows exactly the places in the chosen band, for every band", () => {
    for (const key of BAND_KEYS) {
      const view = run(key);
      const expected = filterByBand(places, centre, key).length;
      expect(view.kind === "list" ? view.cards.length : 0, key).toBe(expected);
      expect(view.count).toBe(expected);
    }
  });
  it("shows every place when no band is chosen", () => {
    expect(run(null).count).toBe(places.length);
  });
  it("ignores a band when no point is typed", () => {
    const view = packPlacesView(places, 0, { ...EMPTY_PACK_QUERY, band: "lt250" }, ctx);
    expect(view.count).toBe(places.length);
  });
  it("counts the distance table over the places before the band is applied, so the counts stay put", () => {
    const all = buildBands(run(null).beforeBand, centre).map((r) => [r.key, r.total]);
    for (const key of BAND_KEYS) expect(buildBands(run(key).beforeBand, centre).map((r) => [r.key, r.total]), key).toEqual(all);
  });
  it("counts the kinds table over the places in the chosen band", () => {
    for (const key of BAND_KEYS) expect(run(key).beforeKind).toHaveLength(filterByBand(places, centre, key).length);
  });
  it("hands back the shown places in the same order as the cards, for every band", () => {
    for (const key of [null, ...BAND_KEYS]) {
      const view = run(key);
      expect(view.shownPlaces.map((p) => p.id), String(key)).toEqual(view.kind === "list" ? view.cards.map((c) => c.id) : []);
    }
  });
  it("combines with the tag filter without losing anyone", () => {
    for (const tag of ["yes", "no", "unknown"] as const) {
      const byTag = places.filter((p) => p.tag === tag);
      for (const key of BAND_KEYS) expect(run(key, { tag }).count, `${tag} ${key}`).toBe(filterByBand(byTag, centre, key).length);
    }
  });
});
