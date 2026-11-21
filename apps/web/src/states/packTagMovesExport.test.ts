import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { ABSENT, MOVE_KEYS, buildTagMoves } from "./packTagMoves";
import { MOVE_CSV_FILENAMES, MOVE_CSV_HEADER, MOVE_TEXT_FILENAMES, moveToken, tagMovesToCsv, tagMovesToText } from "./packTagMovesExport";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const now = (id: string, wheelchair: string | undefined, over: Record<string, unknown> = {}): PackPlaceRecord =>
  parsePackPlaces([{ id, name: `Place ${id}`, wheelchair, category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM, ...over }]).places[0]!;
const before = (id: string, tag: EarlierPlace["tag"], over: Partial<EarlierPlace> = {}): EarlierPlace => ({ id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag, source: "OpenStreetMap, Geofabrik Ontario extract", retrievedOn: "2026-11-10", tier: null, ...over });

const moves = () =>
  buildTagMoves(
    diffPacks(
      [before("b", "yes"), before("a", "yes"), before("c", "unknown"), before("gone", "no")],
      [now("a", "limited"), now("b", "limited"), now("c", "yes"), now("fresh", undefined)],
    ),
  );
const rows = (csv: string): string[][] =>
  csv
    .replace(/\r\n$/, "")
    .split("\r\n")
    .map((l) => l.split(","));

describe("moveToken", () => {
  it("is the tag name, the token UNKNOWN, or one of two fixed words for a place on one side only", () => {
    expect(MOVE_KEYS.map((k) => moveToken(k, "from"))).toEqual(["yes", "limited", "no", "designated", "UNKNOWN", "not_in_earlier_file"]);
    expect(moveToken(ABSENT, "to")).toBe("not_listed_now");
  });
});

describe("tagMovesToCsv", () => {
  it("has the fixed English header", () => {
    expect(rows(tagMovesToCsv(moves()))[0]).toEqual([...MOVE_CSV_HEADER]);
  });
  it("has one row for each cell that has places, in table order", () => {
    expect(rows(tagMovesToCsv(moves())).slice(1).map((r) => `${r[0]}>${r[1]}`)).toEqual(["yes>limited", "no>not_listed_now", "UNKNOWN>yes", "not_in_earlier_file>UNKNOWN"]);
  });
  it("gives the number of places and their ids in id order, separated by spaces", () => {
    expect(rows(tagMovesToCsv(moves())).slice(1)[0]).toEqual(["yes", "limited", "2", "a b"]);
  });
  it("adds up to the places that moved, were added or were removed", () => {
    const m = moves();
    const total = rows(tagMovesToCsv(m))
      .slice(1)
      .reduce((n, r) => n + Number(r[2]), 0);
    expect(total).toBe(m.tagChanges + m.added + m.removed);
  });
  it("is only the header when nothing moved", () => {
    const none = buildTagMoves(diffPacks([before("a", "yes")], [now("a", "yes")]));
    expect(rows(tagMovesToCsv(none))).toEqual([[...MOVE_CSV_HEADER]]);
  });
  it("ends every line with CRLF and starts with a byte order mark only when asked", () => {
    const text = tagMovesToCsv(moves());
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
    expect(text.startsWith("\uFEFF")).toBe(false);
    expect(tagMovesToCsv(moves(), { bom: true }).startsWith("\uFEFFfrom,")).toBe(true);
  });
  it("defuses an id that a spreadsheet would run as a formula", () => {
    const m = buildTagMoves(diffPacks([before("=cmd", "yes")], [now("=cmd", "no")]));
    expect(rows(tagMovesToCsv(m))[1]![3]!.startsWith("'")).toBe(true);
  });
  it("is the same file each time for the same lists", () => {
    expect(tagMovesToCsv(moves())).toBe(tagMovesToCsv(moves()));
  });
});

describe("tagMovesToText", () => {
  it("starts with the title, an underline of the same length, the date and the summary", () => {
    const lines = tagMovesToText(moves(), "en", TODAY).split("\n");
    expect(lines[0]).toBe("How wheelchair tags changed");
    expect(lines[1]).toBe("=".repeat(lines[0]!.length));
    expect(lines[2]).toBe("Date: 2026-11-19");
    expect(lines[3]).toMatch(/^3 places changed their wheelchair tag:/);
  });
  it("says how many were added and no longer listed, and that a move is not a rating", () => {
    const text = tagMovesToText(moves(), "en", TODAY);
    expect(text).toContain("1 place added; 1 place no longer listed.");
    expect(text).toContain("is not a rating of the place");
  });
  it("gives one block per move with the places named and their ids", () => {
    const text = tagMovesToText(moves(), "en", TODAY);
    expect(text).toContain("Yes to Limited — 2 places\n  - Place a (a)\n  - Place b (b)\n");
    expect(text).toContain("Not in the earlier file to UNKNOWN — 1 place\n  - Place fresh (fresh)\n");
  });
  it("names a place with no name as UNKNOWN", () => {
    const m = buildTagMoves(diffPacks([before("a", "yes", { name: null })], [now("a", "no", { name: "" })]));
    expect(tagMovesToText(m, "en", TODAY)).toContain("  - UNKNOWN (a)");
  });
  it("ends with the exact OpenStreetMap credit and a final newline, in both languages", () => {
    for (const locale of ["en", "fr"] as const) expect(tagMovesToText(moves(), locale, TODAY).endsWith("\n© OpenStreetMap contributors\n")).toBe(true);
  });
  it("sets French typography and uses UNKNOWN, never INCONNU", () => {
    const text = tagMovesToText(moves(), "fr", TODAY);
    expect(text).toContain("Date\u00a0: 2026-11-19");
    expect(text).toContain("Oui vers Limité — 2 lieux");
    expect(text).not.toMatch(/INCONNU/i);
    expect(text).not.toContain("'");
    expect(text).not.toMatch(/ [:;!?]/);
  });
  it("is clean copy line by line in both languages, apart from the pack's own place names", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const line of tagMovesToText(moves(), locale, TODAY).split("\n")) {
        if (line.startsWith("©") || line.startsWith("  - ")) continue;
        expect(lintCopy(line, locale), line).toEqual([]);
      }
    }
  });
  it("still says what it found when no tag moved", () => {
    const text = tagMovesToText(buildTagMoves(diffPacks([before("a", "yes")], [now("a", "yes")])), "en", TODAY);
    expect(text).toContain("No wheelchair tag changed in the places found in both.");
  });
});

describe("file names", () => {
  it("are plain ASCII, differ by language and end in the right extension", () => {
    for (const name of [...Object.values(MOVE_CSV_FILENAMES), ...Object.values(MOVE_TEXT_FILENAMES)]) expect(name).toMatch(/^[a-z-]+\.(csv|txt)$/);
    expect(MOVE_CSV_FILENAMES.en).not.toBe(MOVE_CSV_FILENAMES.fr);
    expect(MOVE_TEXT_FILENAMES.fr.endsWith(".txt")).toBe(true);
  });
});
