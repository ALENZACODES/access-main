import { describe, expect, it } from "vitest";
import {
  KIND_ORDERS,
  UNKNOWN_KIND,
  buildKindRows,
  filterByKind,
  hiddenKindsLine,
  kindKey,
  limitKinds,
  reportedShare,
  sortKindRows,
  summariseKinds,
} from "./packCategories";
import { kindsToCsv, kindsToText } from "./packCategoryExport";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { packPlacesView, EMPTY_PACK_QUERY } from "./packPlacesView";

const TODAY = "2026-11-19";
const OSM = "OpenStreetMap, Geofabrik Ontario extract";

/** A small seeded generator so a failing pack can be rebuilt from its seed. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const KINDS = ["bar", "Bar", "cafe", "café", "fast_food", "fast food", "pharmacy", "post_office", "zoo", "", "UNKNOWN", null, 7];
const TAGS = ["yes", "limited", "no", "designated", "", "maybe", "UNKNOWN"];

function randomPack(seed: number, size: number): PackPlaceRecord[] {
  const next = lcg(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const items = Array.from({ length: size }, (_, i) => ({
    id: `p${i}`,
    name: next() < 0.15 ? "" : `Place ${i}`,
    category: pick(KINDS),
    wheelchair: pick(TAGS),
    lat: next() < 0.2 ? undefined : 43 + next(),
    lon: next() < 0.2 ? undefined : -80 + next(),
    provenance: next() < 0.2 ? null : { source_name: OSM, licence: "ODbL-1.0", retrieved_at: next() < 0.3 ? "2024-01-01" : "2026-11-01", tier: 0 },
  }));
  return [...parsePackPlaces(items).places];
}

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 2026];
const SIZES = [0, 1, 2, 5, 40, 250];

describe("kinds table invariants over generated packs", () => {
  for (const seed of SEEDS) {
    for (const size of SIZES) {
      const places = randomPack(seed, size);
      const rows = buildKindRows(places, TODAY);
      const label = `seed ${seed}, ${size} places`;

      it(`counts every place exactly once (${label})`, () => {
        expect(rows.reduce((n, r) => n + r.total, 0)).toBe(places.length);
        expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
        for (const row of rows) {
          expect(row.byTag.yes + row.byTag.limited + row.byTag.no + row.byTag.designated + row.byTag.unknown, row.key).toBe(row.total);
          expect(row.reported, row.key).toBe(row.total - row.byTag.unknown);
          expect(row.withLocation).toBeLessThanOrEqual(row.total);
          expect(row.stale).toBeLessThanOrEqual(row.total);
        }
      });

      it(`agrees with the filter and with the list view (${label})`, () => {
        for (const row of rows) {
          expect(filterByKind(places, row.key), row.key).toHaveLength(row.total);
          const view = packPlacesView(places, 0, { ...EMPTY_PACK_QUERY, kind: row.key }, { locale: "en", today: TODAY });
          expect(view.count, row.key).toBe(row.total);
        }
        expect(places.every((p) => rows.some((r) => r.key === kindKey(p.category)))).toBe(true);
      });

      it(`keeps UNKNOWN last and names no stated kind for a place that states none (${label})`, () => {
        const at = rows.findIndex((r) => r.key === UNKNOWN_KIND);
        if (at !== -1) expect(at).toBe(rows.length - 1);
        const unknownCount = places.filter((p) => kindKey(p.category) === UNKNOWN_KIND).length;
        expect(summariseKinds(rows).unknownPlaces).toBe(unknownCount);
      });

      it(`sorting and limiting only move or leave out rows, and say what was left out (${label})`, () => {
        for (const order of KIND_ORDERS) {
          const sorted = sortKindRows(rows, order);
          expect(sorted.map((r) => r.key).sort()).toEqual(rows.map((r) => r.key).sort());
          const last = sorted[sorted.length - 1];
          if (last && sorted.some((r) => r.key === UNKNOWN_KIND)) expect(last.key).toBe(UNKNOWN_KIND);
        }
        for (const min of [1, 2, 3, 10]) {
          const limited = limitKinds(rows, min);
          expect(limited.shown.reduce((n, r) => n + r.total, 0) + limited.hiddenPlaces).toBe(places.length);
          expect(limited.shown.length + limited.hiddenKinds).toBe(rows.length);
          expect(hiddenKindsLine(limited, min, "en") === null).toBe(limited.hiddenKinds === 0);
        }
      });

      it(`makes files whose size follows the table (${label})`, () => {
        const csv = kindsToCsv(rows).split("\r\n").filter(Boolean);
        expect(csv).toHaveLength(rows.length + 1);
        const text = kindsToText(rows, "en", TODAY);
        expect(text.split("\n").filter((l) => / — \d+ places?$/.test(l))).toHaveLength(rows.length);
        expect(text.trimEnd().endsWith("© OpenStreetMap contributors")).toBe(true);
        for (const row of rows) {
          const share = reportedShare(row);
          expect(share === null || (share >= 0 && share <= 100), row.key).toBe(true);
        }
      });
    }
  }
});

describe("kinds table on awkward packs", () => {
  it("handles a pack where every place has the same kind spelled five ways", () => {
    const spellings = ["fast_food", "Fast_Food", "fast food", "FAST  FOOD", "fást_food"];
    const places = [...parsePackPlaces(spellings.map((category, i) => ({ id: `s${i}`, name: `S${i}`, category, wheelchair: "yes", provenance: null }))).places];
    const rows = buildKindRows(places, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "fast food", total: 5 });
  });
  it("cuts a very long kind to the parser's limit and still groups it", () => {
    const long = "x".repeat(400);
    const places = [...parsePackPlaces([{ id: "a", category: long }, { id: "b", category: long }]).places];
    const [row] = buildKindRows(places, TODAY);
    expect(row!.total).toBe(2);
    expect((row!.spelling ?? "").length).toBeLessThanOrEqual(100);
  });
  it("lets a thousand places build in one pass without losing any", () => {
    const places = randomPack(5, 1000);
    const rows = buildKindRows(places, TODAY);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(places.length);
  });
});
