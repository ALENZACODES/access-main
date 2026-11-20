import { describe, expect, it } from "vitest";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { ABSENT, MOVE_KEYS, MOVE_TAGS, buildTagMoves, noTagMoves, placesIn, rankedMoves, tagMovesLine } from "./packTagMoves";
import { tagMovesToCsv, tagMovesToText } from "./packTagMovesExport";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };

/** A small seeded generator so a failing pair of lists can be rebuilt from its seed. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const RAW_TAGS = ["yes", "limited", "no", "designated", undefined];

function lists(seed: number, size: number): { earlier: EarlierPlace[]; current: PackPlaceRecord[] } {
  const next = lcg(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const earlier: EarlierPlace[] = [];
  const raw: unknown[] = [];
  for (let i = 0; i < size; i++) {
    const id = `p${i}`;
    const inEarlier = next() < 0.8;
    const inNow = next() < 0.8;
    const tag = pick(RAW_TAGS);
    if (inEarlier) earlier.push({ id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag: (tag ?? "unknown") as EarlierPlace["tag"], source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });
    if (inNow) raw.push({ id, name: `Place ${id}`, wheelchair: next() < 0.5 ? tag : pick(RAW_TAGS), category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM });
  }
  return { earlier, current: [...parsePackPlaces(raw).places] };
}

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 2026, 31337];
const SIZES = [0, 1, 2, 5, 40, 250];

describe("tag moves over generated pairs of lists", () => {
  for (const seed of SEEDS) {
    for (const size of SIZES) {
      const { earlier, current } = lists(seed, size);
      const diff = diffPacks(earlier, current);
      const moves = buildTagMoves(diff);
      const label = `seed ${seed}, ${size} places`;

      it(`counts every added, removed and tag-changed place exactly once (${label})`, () => {
        let total = 0;
        for (const from of MOVE_KEYS) for (const to of MOVE_KEYS) total += moves.cells[from][to];
        expect(total).toBe(diff.added.length + diff.removed.length + moves.tagChanges);
        expect(moves.added).toBe(diff.added.length);
        expect(moves.removed).toBe(diff.removed.length);
        expect(moves.tagChanges).toBe(diff.byField.tag);
        expect(moves.unrecognised).toBe(0);
      });

      it(`keeps the diagonal and the absent-to-absent cell empty (${label})`, () => {
        for (const key of MOVE_KEYS) expect(moves.cells[key][key], key).toBe(0);
      });

      it(`puts added places in the absent row and removed places in the absent column (${label})`, () => {
        const addedByTag = MOVE_TAGS.map((tag) => diff.added.filter((p) => p.tag === tag).length);
        expect(MOVE_TAGS.map((tag) => moves.cells[ABSENT][tag])).toEqual(addedByTag);
        const removedByTag = MOVE_TAGS.map((tag) => diff.removed.filter((p) => p.tag === tag).length);
        expect(MOVE_TAGS.map((tag) => moves.cells[tag][ABSENT])).toEqual(removedByTag);
      });

      it(`splits tag changes into three parts that add up (${label})`, () => {
        expect(moves.nowReported + moves.nowUnknown + moves.betweenReported).toBe(moves.tagChanges);
        const fromUnknown = MOVE_TAGS.reduce((n, to) => n + moves.cells.unknown[to], 0);
        expect(fromUnknown).toBe(moves.nowReported);
      });

      it(`lists as many places in a cell as it counts, in id order, with no place twice (${label})`, () => {
        const seen = new Set<string>();
        for (const from of MOVE_KEYS) {
          for (const to of MOVE_KEYS) {
            const list = placesIn(moves, from, to);
            expect(list).toHaveLength(moves.cells[from][to]);
            expect(list.map((p) => p.id)).toEqual([...list.map((p) => p.id)].sort());
            for (const p of list) {
              expect(seen.has(p.id), p.id).toBe(false);
              seen.add(p.id);
            }
          }
        }
      });

      it(`makes a CSV and a text that agree with the table (${label})`, () => {
        const csvRows = tagMovesToCsv(moves).replace(/\r\n$/, "").split("\r\n").slice(1);
        expect(csvRows).toHaveLength(rankedMoves(moves).length);
        expect(csvRows.reduce((n, r) => n + Number(r.split(",")[2]), 0)).toBe(rankedMoves(moves).reduce((n, m) => n + m.places, 0));
        for (const locale of ["en", "fr"] as const) {
          const text = tagMovesToText(moves, locale, "2026-11-19");
          expect(text.endsWith("\n© OpenStreetMap contributors\n")).toBe(true);
          expect(text).not.toMatch(/INCONNU/i);
        }
        expect(noTagMoves(moves)).toBe(diff.added.length + diff.removed.length + moves.tagChanges === 0);
        expect(tagMovesLine(moves, "en").length).toBeGreaterThan(0);
      });

      it(`is the same whichever way round the lists come in (${label})`, () => {
        const again = buildTagMoves(diffPacks([...earlier].reverse(), [...current].reverse()));
        expect(again.cells).toEqual(moves.cells);
        expect(again.tagChanges).toBe(moves.tagChanges);
      });
    }
  }
});
