import { describe, expect, it } from "vitest";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { ABSENT, MOVE_KEYS, MOVE_TAGS, type MoveKey, buildTagMoves, cellKey, placesIn, rankedMoves, tagMovesLine } from "./packTagMoves";
import { MOVE_CSV_HEADER, tagMovesToCsv, tagMovesToText } from "./packTagMovesExport";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const now = (id: string, wheelchair: string | undefined): PackPlaceRecord =>
  parsePackPlaces([{ id, name: `Place ${id}`, wheelchair, category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM }]).places[0]!;
const before = (id: string, tag: EarlierPlace["tag"]): EarlierPlace => ({ id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag, source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });

type Tag = (typeof MOVE_TAGS)[number];
const raw = (tag: Tag): string | undefined => (tag === "unknown" ? undefined : tag);

/** Every ordered pair of different tags, one place each: the whole table filled by hand-made lists. */
describe("every pair of tags", () => {
  for (const from of MOVE_TAGS) {
    for (const to of MOVE_TAGS) {
      if (from === to) continue;
      it(`${from} to ${to} lands in exactly one cell and nowhere else`, () => {
        const moves = buildTagMoves(diffPacks([before("x", from)], [now("x", raw(to))]));
        expect(moves.cells[from][to]).toBe(1);
        let total = 0;
        for (const a of MOVE_KEYS) for (const b of MOVE_KEYS) total += moves.cells[a][b];
        expect(total).toBe(1);
        expect(moves.tagChanges).toBe(1);
        expect(placesIn(moves, from, to)).toEqual([{ id: "x", name: "Place x" }]);
      });
    }
    it(`${from} with the same tag now is not a move`, () => {
      const moves = buildTagMoves(diffPacks([before("x", from)], [now("x", raw(from))]));
      expect(moves.tagChanges).toBe(0);
      expect(moves.cells[from][from]).toBe(0);
    });
    it(`a ${from} place that was added is in the absent row only`, () => {
      const moves = buildTagMoves(diffPacks([], [now("x", raw(from))]));
      expect(moves.cells[ABSENT][from]).toBe(1);
      expect(moves.added).toBe(1);
    });
    it(`a ${from} place that was removed is in the absent column only`, () => {
      const moves = buildTagMoves(diffPacks([before("x", from)], []));
      expect(moves.cells[from][ABSENT]).toBe(1);
      expect(moves.removed).toBe(1);
    });
  }
});

describe("a mixed list read by hand", () => {
  const earlier = [before("a", "yes"), before("b", "yes"), before("c", "limited"), before("d", "no"), before("e", "unknown"), before("f", "unknown"), before("g", "designated"), before("gone1", "yes"), before("gone2", "unknown")];
  const current = [now("a", "no"), now("b", "yes"), now("c", undefined), now("d", "no"), now("e", "limited"), now("f", "designated"), now("g", "designated"), now("new1", "yes"), now("new2", undefined), now("new3", undefined)];
  const moves = buildTagMoves(diffPacks(earlier, current));
  it("has the expected moves", () => {
    expect(moves.tagChanges).toBe(4);
    expect(moves.cells.yes.no).toBe(1);
    expect(moves.cells.limited.unknown).toBe(1);
    expect(moves.cells.unknown.limited).toBe(1);
    expect(moves.cells.unknown.designated).toBe(1);
  });
  it("has the expected additions and removals", () => {
    expect(moves.added).toBe(3);
    expect(moves.removed).toBe(2);
    expect(moves.cells[ABSENT].yes).toBe(1);
    expect(moves.cells[ABSENT].unknown).toBe(2);
    expect(moves.cells.yes[ABSENT]).toBe(1);
    expect(moves.cells.unknown[ABSENT]).toBe(1);
  });
  it("splits the four tag changes by direction", () => {
    expect([moves.nowReported, moves.nowUnknown, moves.betweenReported]).toEqual([2, 1, 1]);
  });
  it("says it in a sentence in each language", () => {
    expect(tagMovesLine(moves, "en")).toBe("4 places changed their wheelchair tag: 2 from UNKNOWN to a reported tag; 1 from a reported tag to UNKNOWN; 1 from one reported tag to another.");
    expect(tagMovesLine(moves, "fr")).toBe("4 lieux ont changé d’indication pour fauteuil roulant\u00a0: 2 de UNKNOWN à une indication fournie\u202f; 1 d’une indication fournie à UNKNOWN\u202f; 1 d’une indication fournie à une autre.");
  });
  it("ranks the cells with two places first, then the rest in table order", () => {
    const ranked = rankedMoves(moves).map((m) => `${cellKey(m.from, m.to)}:${m.places}`);
    expect(ranked[0]).toBe("absent>unknown:2");
    expect(ranked.slice(1).every((r) => r.endsWith(":1"))).toBe(true);
  });
  it("writes a CSV whose rows add up to the table", () => {
    const rows = tagMovesToCsv(moves).replace(/\r\n$/, "").split("\r\n");
    expect(rows[0]).toBe(MOVE_CSV_HEADER.join(","));
    expect(rows.slice(1).reduce((n, r) => n + Number(r.split(",")[2]), 0)).toBe(4 + 3 + 2);
  });
  it("writes a text with a block for each move", () => {
    const text = tagMovesToText(moves, "en", "2026-11-19");
    expect((text.match(/ — \d+ places?\n/g) ?? []).length).toBe(rankedMoves(moves).length);
  });
});

describe("the order of places and cells does not depend on the order of the files", () => {
  const ids = ["m", "c", "x", "a", "q", "b"];
  const earlier = ids.map((id, i) => before(id, MOVE_TAGS[i % 5]!));
  const current = ids.map((id, i) => now(id, raw(MOVE_TAGS[(i + 2) % 5]!)));
  const same = JSON.stringify(buildTagMoves(diffPacks(earlier, current)).cells);
  it("gives the same counts when the lists are reversed or rotated", () => {
    for (const [e, c] of [[[...earlier].reverse(), current], [earlier, [...current].reverse()], [[...earlier.slice(2), ...earlier.slice(0, 2)], current]] as const)
      expect(JSON.stringify(buildTagMoves(diffPacks(e, c)).cells)).toBe(same);
  });
  it("gives the same CSV text", () => {
    expect(tagMovesToCsv(buildTagMoves(diffPacks([...earlier].reverse(), current)))).toBe(tagMovesToCsv(buildTagMoves(diffPacks(earlier, current))));
  });
});

describe("ids that need care", () => {
  const odd = ["a_b", "x,y", 'q"r', "line", "é", "=SUM(1)", "+1", "@x", "-5"];
  const moves = buildTagMoves(diffPacks(odd.map((id) => before(id, "yes")), odd.map((id) => now(id, "no"))));
  it("keeps every id in the cell list as it was given", () => {
    expect(placesIn(moves, "yes", "no").map((p) => p.id).sort()).toEqual([...odd].sort());
  });
  it("quotes or defuses ids in the CSV so a reader gets one row, with the right count", () => {
    const csv = tagMovesToCsv(moves);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(csv).toContain(",9,");
    expect(csv.split("\r\n")[1]).toMatch(/^yes,no,9,/);
  });
  it("defuses the id cell, because a spreadsheet reads the cell by its first character", () => {
    const cell = tagMovesToCsv(moves).split("\r\n")[1]!.replace(/^yes,no,9,/, "");
    expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
  });
});

describe("large lists", () => {
  it("counts ten thousand places without losing any", () => {
    const ids = Array.from({ length: 10000 }, (_, i) => `p${i}`);
    const moves = buildTagMoves(diffPacks(ids.map((id, i) => before(id, MOVE_TAGS[i % 5]!)), ids.map((id, i) => now(id, raw(MOVE_TAGS[(i + 1) % 5]!)))));
    expect(moves.tagChanges).toBe(10000);
    const sum = (key: MoveKey) => MOVE_KEYS.reduce((n, to) => n + moves.cells[key][to], 0);
    expect(MOVE_TAGS.reduce((n, k) => n + sum(k), 0)).toBe(10000);
  });
});
