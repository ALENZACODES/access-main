import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { MOVE_KEYS, addedRemovedLine, buildTagMoves, moveKeyLabel, moveLabel, tagMovesLine, tagMovesNote } from "./packTagMoves";
import { tagMovesToText } from "./packTagMovesExport";
import { lintFrench } from "./typography";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const now = (id: string, wheelchair: string | undefined): PackPlaceRecord =>
  parsePackPlaces([{ id, name: `Place ${id}`, wheelchair, category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM }]).places[0]!;
const before = (id: string, tag: EarlierPlace["tag"]): EarlierPlace => ({ id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag, source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });

/** n places that went from "yes" to "no". */
const flipped = (n: number) => buildTagMoves(diffPacks(Array.from({ length: n }, (_, i) => before(`p${i}`, "yes")), Array.from({ length: n }, (_, i) => now(`p${i}`, "no"))));
const addedOnly = (n: number) => buildTagMoves(diffPacks([], Array.from({ length: n }, (_, i) => now(`p${i}`, "yes"))));
const removedOnly = (n: number) => buildTagMoves(diffPacks(Array.from({ length: n }, (_, i) => before(`p${i}`, "yes")), []));

describe("every pair of sides has words in both languages", () => {
  for (const locale of ["en", "fr"] as const) {
    for (const from of MOVE_KEYS) {
      for (const to of MOVE_KEYS) {
        it(`${from} to ${to} reads as one clean line (${locale})`, () => {
          const line = moveLabel(from, to, locale);
          expect(line.length).toBeGreaterThan(3);
          expect(lintCopy(line, locale), line).toEqual([]);
          expect(line).toContain(moveKeyLabel(from, locale, "from"));
          expect(line).toContain(moveKeyLabel(to, locale, "to"));
          expect(line).not.toMatch(/undefined|null|\[object/);
          expect(line).not.toMatch(/INCONNU/i);
        });
      }
    }
  }
  it("gives every side a different label, so a table row is never ambiguous", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const side of ["from", "to"] as const) expect(new Set(MOVE_KEYS.map((k) => moveKeyLabel(k, locale, side))).size).toBe(MOVE_KEYS.length);
    }
  });
});

describe("plural and singular agreement", () => {
  const cases: Array<[number, string, string]> = [
    [1, "1 place changed its wheelchair tag", "1 lieu a changé d’indication"],
    [2, "2 places changed their wheelchair tag", "2 lieux ont changé d’indication"],
    [5, "5 places changed their wheelchair tag", "5 lieux ont changé d’indication"],
    [11, "11 places changed their wheelchair tag", "11 lieux ont changé d’indication"],
    [101, "101 places changed their wheelchair tag", "101 lieux ont changé d’indication"],
  ];
  for (const [n, en, fr] of cases) {
    it(`starts "${en}" for ${n}`, () => {
      expect(tagMovesLine(flipped(n), "en").startsWith(en)).toBe(true);
      expect(tagMovesLine(flipped(n), "fr").startsWith(fr)).toBe(true);
    });
  }
  it("counts added and removed with the right noun", () => {
    expect(addedRemovedLine(addedOnly(1), "en")).toBe("1 place added.");
    expect(addedRemovedLine(addedOnly(3), "en")).toBe("3 places added.");
    expect(addedRemovedLine(removedOnly(1), "en")).toBe("1 place no longer listed.");
    expect(addedRemovedLine(removedOnly(4), "en")).toBe("4 places no longer listed.");
    expect(addedRemovedLine(addedOnly(1), "fr")).toBe("1 lieu ajouté.");
    expect(addedRemovedLine(addedOnly(3), "fr")).toBe("3 lieux ajoutés.");
    expect(addedRemovedLine(removedOnly(1), "fr")).toBe("1 lieu ne figure plus.");
    expect(addedRemovedLine(removedOnly(4), "fr")).toBe("4 lieux ne figurent plus.");
  });
});

describe("typography of everything the feature writes in French", () => {
  const moves = buildTagMoves(diffPacks([before("a", "yes"), before("b", "unknown"), before("gone", "no")], [now("a", "limited"), now("b", "yes"), now("fresh", undefined)]));
  const lines = [tagMovesLine(moves, "fr"), addedRemovedLine(moves, "fr"), tagMovesNote("fr"), ...MOVE_KEYS.map((k) => moveKeyLabel(k, "fr", "from")), ...MOVE_KEYS.map((k) => moveKeyLabel(k, "fr", "to"))];
  it("passes the French typography check line by line", () => {
    for (const line of lines) expect(lintFrench(line), line).toEqual([]);
  });
  it("passes it for the whole saved text, apart from the pack's own place names", () => {
    for (const line of tagMovesToText(moves, "fr", "2026-11-19").split("\n")) {
      if (line.startsWith("  - ") || line.startsWith("©")) continue;
      expect(lintFrench(line), line).toEqual([]);
    }
  });
  it("uses the typographic apostrophe, never the straight one, in French copy", () => {
    for (const line of lines) expect(line, line).not.toContain("'");
  });
  it("never ends a French line with a space, or has two spaces in a row", () => {
    for (const line of lines) {
      expect(line).toBe(line.trim());
      expect(line).not.toMatch(/ {2}/);
    }
  });
});

describe("English copy", () => {
  const moves = flipped(3);
  it("has no double spaces, no trailing space and ends each sentence with a full stop", () => {
    for (const line of [tagMovesLine(moves, "en"), tagMovesNote("en")]) {
      expect(line).toBe(line.trim());
      expect(line).not.toMatch(/ {2}/);
      expect(line.endsWith(".")).toBe(true);
    }
  });
  it("says what the table counts, and what a move is not, in plain words", () => {
    expect(tagMovesNote("en")).toMatch(/difference between two lists/);
    expect(tagMovesNote("en")).toMatch(/not a rating/);
  });
});
