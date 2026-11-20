import { describe, expect, it } from "vitest";
import { parseCsv, undoFormulaGuard } from "./csvParse";
import { csvCell } from "./exportData";
import { diffPacks, isUnchanged } from "./packDiff";
import { diffToCsv, diffToText } from "./packDiffText";
import { readEarlierFile } from "./packEarlier";
import { packPlacesToCsv, readExportRecords } from "./packExport";
import { parsePackPlaces } from "./packPlaces";

/** A small seeded generator so a failing case can be rebuilt from its seed. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const TAGS = ["yes", "limited", "no", "designated", ""];
const KINDS = ["cafe", "bar", "fast_food", "pharmacy", null];
const WORDS = ["Corner", "Maple", "Éclair", "North", "Station", "Café", "O'Neil", "A,B", 'Say "hi"', "=SUM(A1)", "+1", "-x", "@home", "two\nlines", "  padded  ", ""];

type Raw = Record<string, unknown>;

function makePack(seed: number, size: number): Raw[] {
  const next = lcg(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  return Array.from({ length: size }, (_, i) => ({
    id: `osm:node/${seed}-${i}`,
    name: next() < 0.1 ? "" : `${pick(WORDS)} ${pick(WORDS)}`.trim(),
    category: pick(KINDS),
    address: next() < 0.2 ? "" : `${Math.floor(next() * 900)} ${pick(WORDS)} Street`,
    wheelchair: pick(TAGS),
    lat: next() < 0.15 ? undefined : Number((43 + next()).toFixed(6)),
    lon: next() < 0.15 ? undefined : Number((-80 + next()).toFixed(6)),
    provenance: { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 },
  }));
}

const saved = (items: Raw[]) => {
  const r = readEarlierFile(packPlacesToCsv(readExportRecords(items).records));
  if (!r.ok) throw new Error(`${r.problem}`);
  return r;
};
const current = (items: Raw[]) => [...parsePackPlaces(items).places];
const tiers = (items: Raw[]) => new Map(readExportRecords(items).records.map((x) => [x.place.id, x.tier] as const));

describe("saving and reading back, over generated packs", () => {
  for (const seed of [1, 2, 3, 5, 8, 13, 21, 2026]) {
    for (const size of [1, 4, 30, 200]) {
      it(`a pack compared with the file saved from it differs in nothing (seed ${seed}, ${size} places)`, () => {
        const items = makePack(seed, size);
        const r = saved(items);
        expect(r.skippedTotal).toBe(0);
        const d = diffPacks(r.places, current(items), { tiers: tiers(items) });
        expect(d.changed, "changed").toEqual([]);
        expect(isUnchanged(d)).toBe(true);
        expect(d.unchanged).toBe(parsePackPlaces(items).places.length);
      });
    }
  }
});

describe("changes made after saving are found exactly, over generated packs", () => {
  for (const seed of [4, 9, 16, 25, 36]) {
    it(`finds the places added, removed and given a different tag (seed ${seed})`, () => {
      const next = lcg(seed * 7);
      const items = makePack(seed, 60);
      const earlier = saved(items);
      const removed = new Set<number>();
      const flipped = new Set<number>();
      for (let i = 0; i < items.length; i += 1) {
        const roll = next();
        if (roll < 0.15) removed.add(i);
        else if (roll < 0.35) flipped.add(i);
      }
      const edited: Raw[] = items
        .filter((_, i) => !removed.has(i))
        .map((p) => {
          const index = items.indexOf(p);
          if (!flipped.has(index)) return p;
          // A different tag is always a change, so the count is exact: yes -> no, anything else -> yes.
          const now = parsePackPlaces([p]).places[0]!.tag;
          return { ...p, wheelchair: now === "yes" ? "no" : "yes" };
        });
      const addedCount = 5;
      for (let i = 0; i < addedCount; i += 1) edited.push({ ...makePack(seed + 100, 1)[0]!, id: `osm:node/new-${seed}-${i}` });
      const d = diffPacks(earlier.places, current(edited), { tiers: tiers(edited) });
      expect(d.removed.map((p) => p.id).sort()).toEqual([...removed].map((i) => items[i]!.id as string).sort());
      expect(d.added).toHaveLength(addedCount);
      expect(d.changed.map((c) => c.id).sort()).toEqual([...flipped].map((i) => items[i]!.id as string).sort());
      for (const c of d.changed) expect(c.changes.map((f) => f.field), c.id).toEqual(["tag"]);
      expect(d.unchanged + d.changed.length + d.removed.length).toBe(earlier.places.length);
      expect(d.byField.tag).toBe(flipped.size);
    });
  }
  it("gives the same answer whatever order the pack lists its places", () => {
    const items = makePack(77, 40);
    const earlier = saved(items).places;
    const edited = items.map((p, i) => (i % 5 === 0 ? { ...p, wheelchair: "designated" } : p));
    const forward = diffPacks(earlier, current(edited));
    const reversed = diffPacks([...earlier].reverse(), current([...edited].reverse()));
    expect(reversed).toEqual(forward);
  });
  it("makes a file with one row per change, and a report with every changed place", () => {
    const items = makePack(31, 40);
    const earlier = saved(items).places;
    const edited = items.slice(3).map((p, i) => (i % 4 === 0 ? { ...p, wheelchair: "designated", category: "zoo" } : p));
    const d = diffPacks(earlier, current(edited));
    const rows = d.added.length + d.removed.length + d.changed.reduce((n, c) => n + c.changes.length, 0);
    expect(diffToCsv(d).split("\r\n").filter(Boolean)).toHaveLength(rows + 1);
    const text = diffToText(d, "en", "2026-11-19");
    for (const c of d.changed) expect(text, c.id).toContain(`(${c.id})`);
  });
});

describe("CSV cells survive a round trip, over generated text", () => {
  it("reads back exactly what csvCell wrote once the guard is undone", () => {
    const next = lcg(99);
    const alphabet = ["a", "b", " ", ",", '"', "'", "\r", "\n", "=", "+", "-", "@", "é", "€", "\t"];
    let checked = 0;
    for (let i = 0; i < 400; i += 1) {
      const cells = Array.from({ length: 1 + Math.floor(next() * 4) }, () => Array.from({ length: Math.floor(next() * 8) }, () => alphabet[Math.floor(next() * alphabet.length)]).join(""));
      // A cell that already starts with an apostrophe and a formula character cannot be told from a guarded one.
      // That is the one ambiguity the guard has, so such cells are left out here.
      if (cells.some((c) => /^'[=+\-@\t\r]/.test(c))) continue;
      // A row of one empty cell is a blank line and is not a row.
      if (cells.length === 1 && cells[0] === "") continue;
      const parsed = parseCsv(`${cells.map(csvCell).join(",")}\r\n`);
      expect(parsed.ok && parsed.rows.map((row) => row.map(undoFormulaGuard)), JSON.stringify(cells)).toEqual([cells]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(300);
  });
  it("reads a row of one empty cell as a blank line, not a row", () => {
    expect(parseCsv(`${csvCell("")}\r\n`)).toEqual({ ok: true, rows: [] });
  });
});
