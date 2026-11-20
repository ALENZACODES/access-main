import { describe, expect, it } from "vitest";
import type { RegionCell, RegionManifest } from "./regionDownload";
import type { InventoryCause, InventoryCell, RegionInventory } from "./regionInventory";
import {
  appendHandoffNote, captureHandoff, changeHandoffNote, compareHandoff,
  pageHandoff, parseHandoffBook, serializeHandoffBook, startHandoff,
  updateHandoff, validateHandoffCapture, HANDOFF_MAX_CELLS,
  HANDOFF_MAX_JSON_BYTES, HANDOFF_MAX_NOTES,
} from "./handoffRehearsal";

const date = "2026-11-19T12:00:00.000Z";
const later = "2026-11-19T13:00:00.000Z";
const source = { source: "Ontario open data", licence: "Open Government Licence", date: "2026-11-01" };
const north: RegionCell = { id: "north", bytes: 400, provenance: source };
const south: RegionCell = { id: "south", bytes: 800, provenance: source };
const east: RegionCell = { id: "east", bytes: 200, provenance: source };
const manifest: RegionManifest = { regionId: "ontario-example", cells: [north, south, east] };

function required<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new RangeError(`Missing fixture at ${index}`);
  return value;
}
function inventory(causes: readonly InventoryCause[]): RegionInventory {
  if (causes.length !== manifest.cells.length) throw new RangeError("Fixture needs one cause per cell");
  const cells: InventoryCell[] = manifest.cells.map((cell, index): InventoryCell => {
    const cause = required(causes, index);
    return {
      id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
      state: cause === "present" ? "saved" : "unknown", cause,
    };
  });
  const saved = cells.filter((cell) => cell.state === "saved");
  return {
    regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    expectedBytes: manifest.cells.reduce((sum, cell) => sum + cell.bytes, 0),
    complete: saved.length === cells.length,
  };
}
const capture = () => captureHandoff(manifest, inventory(["present", "missing", "unreadable"]), date);
const after = () => captureHandoff(manifest, inventory(["missing", "present", "stale"]), later);
const note = { id: "note-1", cellId: "north", kind: "observation" as const,
  resolution: "open" as const, text: "Check this saved copy manually", at: later };

describe("offline handoff capture with strict fixtures", () => {
  it("retains listed IDs and source metadata", () => {
    const value = capture();
    expect(value.cells.map((cell) => cell.id)).toEqual(["north", "south", "east"]);
    expect(required(value.cells, 0).source).toEqual({ ...source, bytes: 400 });
    expect(required(value.cells, 0).state).toBe("saved");
    expect(required(value.cells, 1).state).toBe("UNKNOWN");
    expect(required(value.cells, 2).cause).toBe("unreadable");
  });
  it("keeps an absent inventory UNKNOWN", () => {
    const value = captureHandoff(manifest, null, date);
    expect(value.status).toBe("UNKNOWN");
    expect(value.cells.every((cell) => cell.state === "UNKNOWN" && cell.cause === "UNKNOWN")).toBe(true);
  });
  it("rejects a region mismatch", () => {
    const original = inventory(["present", "present", "present"]);
    expect(required(captureHandoff(manifest, { ...original, regionId: "elsewhere" }, date).cells, 0).state).toBe("UNKNOWN");
  });
  it("rejects missing inventory entries", () => {
    const original = inventory(["present", "present", "present"]);
    expect(captureHandoff(manifest, { ...original, cells: original.cells.slice(1) }, date).status).toBe("UNKNOWN");
  });
  it("rejects provenance and size changes", () => {
    const original = inventory(["present", "present", "present"]);
    const first = required(original.cells, 0);
    const changedSource: RegionInventory = { ...original, cells: [
      { ...first, provenance: { ...source, date: "2026-10-01" } }, ...original.cells.slice(1),
    ] };
    const changedSize: RegionInventory = { ...original, cells: [
      { ...first, expectedBytes: 300 }, ...original.cells.slice(1),
    ] };
    expect(required(captureHandoff(manifest, changedSource, date).cells, 0).state).toBe("UNKNOWN");
    expect(required(captureHandoff(manifest, changedSize, date).cells, 0).state).toBe("UNKNOWN");
  });
  it("rejects duplicates, empty regions and too many cells", () => {
    expect(() => captureHandoff({ ...manifest, cells: [north, north] }, null, date)).toThrow();
    expect(() => captureHandoff({ ...manifest, regionId: " " }, null, date)).toThrow();
    expect(() => captureHandoff({ ...manifest, cells: Array.from({ length: HANDOFF_MAX_CELLS + 1 }, (_, i) =>
      ({ id: `cell-${i}`, bytes: 1, provenance: source })) }, null, date)).toThrow();
  });
  it("rejects timestamps and impossible source values", () => {
    for (const bad of ["tomorrow", "2026-11-19", "2026-11-19T12:00:00+00:00", ""]) {
      expect(() => captureHandoff(manifest, null, bad)).toThrow();
    }
    expect(() => captureHandoff({ ...manifest, cells: [{ ...north, bytes: -1 }] }, null, date)).toThrow();
    expect(() => captureHandoff({ ...manifest, cells: [{ ...north, provenance: { ...source, date: "2026-02-31" } }] }, null, date)).toThrow();
  });
});

describe("handoff comparison and review", () => {
  it("reports lost, gained and changed observations", () => {
    const result = compareHandoff(capture(), after());
    expect(result.rows.map((row) => row.change)).toEqual(["lost", "gained", "changed"]);
    expect(result.counts).toEqual({ unchanged: 0, lost: 1, gained: 1, changed: 1, UNKNOWN: 0 });
  });
  it("treats a missing observation as UNKNOWN", () => {
    const result = compareHandoff(capture(), captureHandoff(manifest, null, later));
    expect(result.status).toBe("UNKNOWN");
    expect(result.rows.every((row) => row.change === "UNKNOWN")).toBe(true);
  });
  it("does not infer a gain from an unreadable observation", () => {
    const result = compareHandoff(captureHandoff(manifest, inventory(["unreadable", "missing", "missing"]), date),
      captureHandoff(manifest, inventory(["present", "missing", "missing"]), later));
    expect(required(result.rows, 0).change).toBe("changed");
  });
  it("does not conflate regions or reverse timestamps", () => {
    expect(() => compareHandoff(capture(), { ...after(), regionId: "other" })).toThrow();
    expect(() => compareHandoff(after(), capture())).toThrow();
  });
  it("preserves identical observations and marks listing differences UNKNOWN", () => {
    const first = capture();
    expect(compareHandoff(first, { ...first, capturedAt: later }).rows.every((row) => row.change === "unchanged")).toBe(true);
    const added = captureHandoff({ ...manifest, cells: [...manifest.cells, { id: "west", bytes: 10, provenance: source }] }, null, later);
    expect(compareHandoff(first, added).rows.at(-1)?.change).toBe("UNKNOWN");
    const removed = captureHandoff({ ...manifest, cells: [north] }, null, later);
    expect(required(compareHandoff(first, removed).rows, 1).change).toBe("UNKNOWN");
  });
  it("marks provenance drift UNKNOWN", () => {
    const updated: RegionManifest = { ...manifest, cells: [
      { ...north, provenance: { ...source, date: "2026-11-02" } }, south, east,
    ] };
    expect(required(compareHandoff(capture(), captureHandoff(updated, null, later)).rows, 0).change).toBe("UNKNOWN");
  });
  it("filters, searches and pages without changing counts", () => {
    const result = compareHandoff(capture(), after());
    const query = { search: "", filter: "all" as const, order: "manifest" as const, offset: 0, limit: 2 };
    expect(pageHandoff(result, query).rows.map((row) => row.id)).toEqual(["north", "south"]);
    expect(pageHandoff(result, { ...query, filter: "lost" }).rows.map((row) => row.id)).toEqual(["north"]);
    expect(pageHandoff(result, { ...query, filter: "attention" }).total).toBe(3);
    expect(pageHandoff(result, { ...query, search: "NORTH" }).total).toBe(1);
    expect(pageHandoff(result, { ...query, search: "ONTARIO" }).total).toBe(3);
    expect(pageHandoff(result, { ...query, order: "size" }).rows.map((row) => row.id)).toEqual(["south", "north"]);
    expect(required(pageHandoff(result, { ...query, order: "state" }).rows, 0).change).toBe("changed");
    expect(pageHandoff(result, query)).toMatchObject({ total: 3, previous: false, next: true });
    expect(pageHandoff(result, { ...query, offset: 2 })).toMatchObject({ total: 3, previous: true, next: false });
    expect(pageHandoff(result, { ...query, offset: 500 })).toMatchObject({ rows: [], total: 3, next: false });
  });
  it("rejects invalid page controls", () => {
    const result = compareHandoff(capture(), after());
    const query = { search: "", filter: "all" as const, order: "manifest" as const, offset: 0, limit: 2 };
    for (const offset of [-1, 0.5, NaN, Infinity]) expect(() => pageHandoff(result, { ...query, offset })).toThrow();
    for (const limit of [-1, 0, 21, 1.5]) expect(() => pageHandoff(result, { ...query, limit })).toThrow();
    expect(() => pageHandoff(result, { ...query, filter: "other" as "all" })).toThrow();
    expect(() => pageHandoff(result, { ...query, order: "other" as "manifest" })).toThrow();
  });
});

describe("handoff book and bounded notes", () => {
  it("starts without a later observation and explicitly updates", () => {
    const book = startHandoff(capture());
    expect(book).toMatchObject({ after: null, notes: [], regionId: manifest.regionId });
    expect(updateHandoff(book, after()).after?.capturedAt).toBe(later);
  });
  it("records notes for listed cells and changes resolution immutably", () => {
    const book = appendHandoffNote(startHandoff(capture()), note);
    expect(required(book.notes, 0)).toEqual(note);
    expect(required(changeHandoffNote(book, note.id, "reviewing").notes, 0).resolution).toBe("reviewing");
    expect(required(changeHandoffNote(book, note.id, "closed").notes, 0).resolution).toBe("closed");
    expect(required(book.notes, 0).resolution).toBe("open");
    expect(() => appendHandoffNote(book, note)).toThrow();
    expect(() => appendHandoffNote(book, { ...note, id: "other", cellId: "unlisted" })).toThrow();
    expect(() => changeHandoffNote(book, "unlisted", "closed")).toThrow();
  });
  it("rejects invalid note dates, length, quantity and resolution", () => {
    const book = startHandoff(capture());
    expect(() => appendHandoffNote(book, { ...note, at: "2026-11-18T12:00:00.000Z" })).toThrow();
    for (const text of [" ", "x".repeat(1001)]) expect(() => appendHandoffNote(book, { ...note, text })).toThrow();
    const full = { ...book, notes: Array.from({ length: HANDOFF_MAX_NOTES }, (_, i) => ({ ...note, id: `note-${i}` })) };
    expect(() => appendHandoffNote(full, { ...note, id: "extra" })).toThrow();
    expect(() => changeHandoffNote(book, note.id, "other" as "open")).toThrow();
  });
  it("round trips only bounded history and notes", () => {
    const book = appendHandoffNote(updateHandoff(startHandoff(capture()), after()), note);
    expect(parseHandoffBook(serializeHandoffBook(book), manifest.regionId)).toEqual(book);
    expect(() => parseHandoffBook(serializeHandoffBook(book), "another-region")).toThrow();
    expect(() => parseHandoffBook("x".repeat(HANDOFF_MAX_JSON_BYTES + 1), manifest.regionId)).toThrow();
    expect(() => parseHandoffBook("{", manifest.regionId)).toThrow();
    expect(() => parseHandoffBook('{"format":"other"}', manifest.regionId)).toThrow();
  });
  it("rejects inconsistent capture states and duplicate IDs", () => {
    const value = capture();
    const first = required(value.cells, 0);
    expect(() => validateHandoffCapture({ ...value, cells: [
      { ...first, cause: "missing" }, ...value.cells.slice(1),
    ] })).toThrow();
    expect(() => validateHandoffCapture({ ...value, status: "recorded", cells: [
      { ...first, state: "UNKNOWN", cause: "UNKNOWN" }, ...value.cells.slice(1),
    ] })).toThrow();
    expect(() => validateHandoffCapture({ ...value, cells: [first, first] })).toThrow();
    expect(() => validateHandoffCapture({ ...value, cells: [
      { ...first, state: "available" }, ...value.cells.slice(1),
    ] })).toThrow();
    expect(() => validateHandoffCapture({ ...value, cells: [
      { ...first, cause: "unproven" }, ...value.cells.slice(1),
    ] })).toThrow();
  });
  it("rejects invalid imported source, note, region and format", () => {
    const value = capture();
    const first = required(value.cells, 0);
    for (const provenance of [
      { ...first.source, licence: "" }, { ...first.source, source: "" },
      { ...first.source, bytes: -1 }, { ...first.source, date: "2026-13-19" },
    ]) expect(() => validateHandoffCapture({ ...value, cells: [
      { ...first, source: provenance }, ...value.cells.slice(1),
    ] })).toThrow();
    expect(() => validateHandoffCapture({ ...value, regionId: "bad\u0000region" })).toThrow();
    const book = startHandoff(value);
    for (const invalidNote of [
      { ...note, kind: "unsupported" }, { ...note, text: "" },
      { ...note, cellId: "another-region" }, { ...note, resolution: "accepted" },
    ]) expect(() => parseHandoffBook(JSON.stringify({ ...book, notes: [invalidNote] }), manifest.regionId)).toThrow();
    expect(() => parseHandoffBook(JSON.stringify({ ...book, startedAt: later }), manifest.regionId)).toThrow();
    expect(() => parseHandoffBook(JSON.stringify({ ...book, format: "legacy" }), manifest.regionId)).toThrow();
  });
  it("preserves escaped user text as inert data", () => {
    const book = appendHandoffNote(startHandoff(capture()), {
      ...note, text: "A <script> tag is only note text & not executable markup",
    });
    const parsed = parseHandoffBook(serializeHandoffBook(book), manifest.regionId);
    expect(required(parsed.notes, 0).text).toBe(required(book.notes, 0).text);
  });
});
