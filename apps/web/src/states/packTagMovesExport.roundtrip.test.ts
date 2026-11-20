import { describe, expect, it } from "vitest";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { ABSENT, MOVE_KEYS, type MoveKey, buildTagMoves, moveKeyLabel, placesIn } from "./packTagMoves";
import { moveToken, tagMovesToCsv, tagMovesToText } from "./packTagMovesExport";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const TAGS = ["yes", "limited", "no", "designated", undefined];
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function build(seed: number, size: number) {
  const next = lcg(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  const earlier: EarlierPlace[] = [];
  const raw: unknown[] = [];
  for (let i = 0; i < size; i++) {
    const id = `p${i}`;
    if (next() < 0.8) earlier.push({ id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag: (pick(TAGS) ?? "unknown") as EarlierPlace["tag"], source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });
    if (next() < 0.8) raw.push({ id, name: `Place ${id}`, wheelchair: pick(TAGS), category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM });
  }
  return buildTagMoves(diffPacks(earlier, [...parsePackPlaces(raw).places] as PackPlaceRecord[]));
}
const keyOfToken = (token: string, side: "from" | "to"): MoveKey => MOVE_KEYS.find((k) => moveToken(k, side) === token)!;

describe("reading the CSV back rebuilds the table", () => {
  for (const seed of [1, 5, 13, 89, 233, 4181]) {
    for (const size of [10, 80, 300]) {
      it(`gives the same counts and ids (seed ${seed}, ${size} places)`, () => {
        const moves = build(seed, size);
        const rows = tagMovesToCsv(moves).replace(/\r\n$/, "").split("\r\n").slice(1).map((r) => r.split(","));
        const rebuilt = new Map<string, string[]>();
        for (const [from, to, count, ids] of rows) {
          const list = ids!.split(" ").filter(Boolean);
          expect(list).toHaveLength(Number(count));
          rebuilt.set(`${keyOfToken(from!, "from")}>${keyOfToken(to!, "to")}`, list);
        }
        for (const from of MOVE_KEYS) {
          for (const to of MOVE_KEYS) {
            const expected = placesIn(moves, from, to).map((p) => p.id);
            expect(rebuilt.get(`${from}>${to}`) ?? [], `${from}>${to}`).toEqual(expected);
          }
        }
      });
    }
  }
});

describe("the text agrees with the table", () => {
  for (const seed of [2, 6, 34, 610]) {
    for (const locale of ["en", "fr"] as const) {
      it(`names every place once, under its move (seed ${seed}, ${locale})`, () => {
        const moves = build(seed, 120);
        const text = tagMovesToText(moves, locale, "2026-11-19");
        const ids = [...text.matchAll(/^ {2}- .* \((p\d+)\)$/gm)].map((m) => m[1]!);
        expect(new Set(ids).size).toBe(ids.length);
        let expected = 0;
        for (const from of MOVE_KEYS) for (const to of MOVE_KEYS) expected += placesIn(moves, from, to).length;
        expect(ids).toHaveLength(expected);
        for (const from of MOVE_KEYS) {
          for (const to of MOVE_KEYS) {
            if (from === ABSENT && to === ABSENT) continue;
            const n = placesIn(moves, from, to).length;
            if (n === 0) continue;
            expect(text, `${from}>${to}`).toContain(`${moveKeyLabel(from, locale, "from")}`);
          }
        }
      });
    }
  }
  it("has one block per non-empty cell, and each block's count matches its list", () => {
    const moves = build(77, 200);
    const text = tagMovesToText(moves, "en", "2026-11-19");
    const lines = text.split("\n");
    let blocks = 0;
    for (let i = 0; i < lines.length; i++) {
      const head = /— (\d+) places?$/.exec(lines[i]!);
      if (!head) continue;
      blocks++;
      let n = 0;
      while (lines[i + 1 + n]?.startsWith("  - ")) n++;
      expect(n, lines[i]).toBe(Number(head[1]));
    }
    expect(blocks).toBeGreaterThan(0);
  });
});
