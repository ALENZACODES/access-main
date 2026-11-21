import { describe, expect, it } from "vitest";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { diffToText } from "./packDiffText";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { MOVE_KEYS, MOVE_TAGS, buildTagMoves, noTagMoves, tagMovesLine } from "./packTagMoves";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const TAGS = ["yes", "limited", "no", "designated", undefined];
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function pair(seed: number, size: number) {
  const next = lcg(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  const earlier: EarlierPlace[] = [];
  const raw: unknown[] = [];
  for (let i = 0; i < size; i++) {
    const id = `p${i}`;
    const changeOther = next() < 0.2;
    if (next() < 0.85) earlier.push({ id, name: `Place ${id}`, kind: "cafe", address: changeOther ? "Old Road" : "1 Main Street", lat: 43.65, lon: -79.38, tag: (pick(TAGS) ?? "unknown") as EarlierPlace["tag"], source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });
    if (next() < 0.85) raw.push({ id, name: `Place ${id}`, wheelchair: pick(TAGS), category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM });
  }
  return diffPacks(earlier, [...parsePackPlaces(raw).places] as PackPlaceRecord[]);
}

/** The tag moves must say the same thing as the comparison the same people are already reading. */
describe("tag moves agree with the comparison they sit in", () => {
  for (const seed of [4, 9, 16, 25, 36, 49, 64, 81]) {
    const diff = pair(seed, 150);
    const moves = buildTagMoves(diff);
    it(`has the comparison's own count of tag changes (seed ${seed})`, () => {
      expect(moves.tagChanges).toBe(diff.byField.tag);
      expect(moves.added).toBe(diff.added.length);
      expect(moves.removed).toBe(diff.removed.length);
    });
    it(`counts the places the comparison lists as changed in tag exactly (seed ${seed})`, () => {
      const changedInTag = diff.changed.filter((c) => c.changes.some((f) => f.field === "tag")).length;
      expect(moves.tagChanges).toBe(changedInTag);
    });
    it(`is empty exactly when the comparison finds nothing added, removed or re-tagged (seed ${seed})`, () => {
      expect(noTagMoves(moves)).toBe(diff.added.length === 0 && diff.removed.length === 0 && diff.byField.tag === 0);
    });
    it(`names no tag the comparison does not use (seed ${seed})`, () => {
      const seen = new Set<string>();
      for (const c of diff.changed) for (const f of c.changes) if (f.field === "tag") {
        seen.add(f.before);
        seen.add(f.after);
      }
      for (const s of seen) expect(["yes", "limited", "no", "designated", "UNKNOWN"]).toContain(s);
      expect(moves.unrecognised).toBe(0);
    });
    it(`shares its sentence's number with the comparison's text (seed ${seed})`, () => {
      const line = tagMovesLine(moves, "en");
      if (moves.tagChanges > 0) expect(line.startsWith(`${moves.tagChanges} place`)).toBe(true);
      expect(diffToText(diff, "en", "2026-11-19").endsWith("© OpenStreetMap contributors\n")).toBe(true);
    });
  }
});

describe("the sides of the table", () => {
  it("has a row and a column for each tag the pack can hold and one for the absent side", () => {
    expect(MOVE_KEYS).toHaveLength(MOVE_TAGS.length + 1);
    expect(new Set(MOVE_KEYS).size).toBe(MOVE_KEYS.length);
  });
  it("puts the five tags in the order the rest of the App uses", () => {
    expect([...MOVE_TAGS]).toEqual(["yes", "limited", "no", "designated", "unknown"]);
  });
});

describe("tag moves do not change what they are given", () => {
  it("leaves the diff exactly as it was, for every seed", () => {
    for (const seed of [4, 9, 16, 25]) {
      const diff = pair(seed, 100);
      const copy = JSON.stringify(diff);
      buildTagMoves(diff);
      expect(JSON.stringify(diff)).toBe(copy);
    }
  });
  it("gives the same answer twice for the same diff", () => {
    const diff = pair(7, 100);
    const a = buildTagMoves(diff);
    const b = buildTagMoves(diff);
    expect(b.cells).toEqual(a.cells);
    expect([b.tagChanges, b.added, b.removed]).toEqual([a.tagChanges, a.added, a.removed]);
  });
  it("gives an empty table for an empty comparison, with every count zero", () => {
    const moves = buildTagMoves(diffPacks([], []));
    for (const from of MOVE_KEYS) for (const to of MOVE_KEYS) expect(moves.cells[from][to]).toBe(0);
    expect([moves.tagChanges, moves.added, moves.removed, moves.unrecognised]).toEqual([0, 0, 0, 0]);
  });
  it("counts a place only once even when the earlier file repeats its id", () => {
    const e = before("dup");
    const moves = buildTagMoves(diffPacks([e, e], [parsePackPlaces([{ id: "dup", name: "Place dup", wheelchair: "no", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM }]).places[0]!]));
    expect(moves.tagChanges + moves.added + moves.removed).toBeLessThanOrEqual(1);
  });
});

function before(id: string): EarlierPlace {
  return { id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag: "yes", source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null };
}
