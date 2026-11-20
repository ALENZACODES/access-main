import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import {
  appendHandoffNote, captureHandoff, changeHandoffNote, compareHandoff,
  pageHandoff, parseHandoffBook, serializeHandoffBook, startHandoff,
  updateHandoff, validateHandoffCapture, HANDOFF_MAX_CELLS, HANDOFF_MAX_JSON_BYTES,
  HANDOFF_MAX_NOTES,
} from "./handoffRehearsal";

const date = "2026-11-19T12:00:00.000Z";
const later = "2026-11-19T13:00:00.000Z";
const source = { source: "Ontario open data", licence: "Open Government Licence", date: "2026-11-01" };
const manifest: RegionManifest = {
  regionId: "ontario-example", cells: [
    { id: "north", bytes: 400, provenance: source },
    { id: "south", bytes: 800, provenance: source },
    { id: "east", bytes: 200, provenance: source },
  ],
};
function inventory(causes: readonly ("present" | "missing" | "stale" | "unreadable")[]): RegionInventory {
  const cells = manifest.cells.map((cell, i) => ({
    id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
    state: causes[i] === "present" ? "saved" as const : "unknown" as const,
    cause: causes[i],
  }));
  const saved = cells.filter((cell) => cell.state === "saved");
  return {
    regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length, savedBytes: saved.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    expectedBytes: 1400, complete: saved.length === cells.length,
  };
}
const capture = (): ReturnType<typeof captureHandoff> => captureHandoff(manifest, inventory(["present", "missing", "unreadable"]), date);
const after = (): ReturnType<typeof captureHandoff> => captureHandoff(manifest, inventory(["missing", "present", "stale"]), later);

const note = { id: "note-1", cellId: "north", kind: "observation" as const,
  resolution: "open" as const, text: "Check this saved copy manually", at: later };

describe("offline handoff capture", () => {
  it("captures listed IDs, provenance, source date and sizes", () => {
    const value = capture();
    expect(value.cells.map((cell) => cell.id)).toEqual(["north", "south", "east"]);
    expect(value.cells[0].source).toEqual({ ...source, bytes: 400 });
    expect(value.cells[0].state).toBe("saved");
    expect(value.cells[1].state).toBe("UNKNOWN");
    expect(value.cells[2].cause).toBe("unreadable");
  });
  it("does not assert saved status without an inventory", () => {
    const value = captureHandoff(manifest, null, date);
    expect(value.status).toBe("UNKNOWN");
    expect(value.cells.every((cell) => cell.state === "UNKNOWN")).toBe(true);
    expect(value.cells.every((cell) => cell.cause === "UNKNOWN")).toBe(true);
  });
  it("rejects a region mismatch", () => {
    const value = inventory(["present", "present", "present"]);
    expect(captureHandoff(manifest, { ...value, regionId: "elsewhere" }, date).cells[0].state).toBe("UNKNOWN");
  });
  it("rejects a missing inventory entry", () => {
    const value = inventory(["present", "present", "present"]);
    expect(captureHandoff(manifest, { ...value, cells: value.cells.slice(1) }, date).status).toBe("UNKNOWN");
  });
  it("rejects provenance drift rather than treating bytes as proof", () => {
    const value = inventory(["present", "present", "present"]);
    const changed = { ...value, cells: [
      { ...value.cells[0], provenance: { ...source, date: "2026-10-01" } }, ...value.cells.slice(1),
    ] };
    expect(captureHandoff(manifest, changed, date).cells[0]).toMatchObject({ state: "UNKNOWN", cause: "UNKNOWN" });
  });
  it("rejects size drift", () => {
    const value = inventory(["present", "present", "present"]);
    const changed = { ...value, cells: [{ ...value.cells[0], expectedBytes: 300 }, ...value.cells.slice(1)] };
    expect(captureHandoff(manifest, changed, date).cells[0].state).toBe("UNKNOWN");
  });
  it("rejects repeated manifest IDs", () => {
    expect(() => captureHandoff({ ...manifest, cells: [manifest.cells[0], manifest.cells[0]] }, null, date)).toThrow();
  });
  it("rejects empty region IDs", () => {
    expect(() => captureHandoff({ ...manifest, regionId: " " }, null, date)).toThrow();
  });
  it("rejects more cells than allowed", () => {
    expect(() => captureHandoff({ ...manifest, cells: Array.from({ length: HANDOFF_MAX_CELLS + 1 }, (_, i) => ({
      id: `cell-${i}`, bytes: 1, provenance: source,
    })) }, null, date)).toThrow();
  });
  it("rejects malformed timestamps", () => {
    for (const text of ["tomorrow", "2026-11-19", "2026-11-19T12:00:00+00:00", ""]) {
      expect(() => captureHandoff(manifest, null, text)).toThrow();
    }
  });
  it("rejects impossible source dates and negative sizes", () => {
    expect(() => captureHandoff({ ...manifest, cells: [{
      id: "a", bytes: -1, provenance: source,
    }] }, null, date)).toThrow();
    expect(() => captureHandoff({ ...manifest, cells: [{
      id: "a", bytes: 1, provenance: { ...source, date: "2026-02-31" },
    }] }, null, date)).toThrow();
  });
});

describe("historical comparison", () => {
  it("detects lost and gained copies without interpreting physical places", () => {
    const result = compareHandoff(capture(), after());
    expect(result.rows.map((row) => row.change)).toEqual(["lost", "gained", "changed"]);
    expect(result.counts).toEqual({ unchanged: 0, lost: 1, gained: 1, changed: 1, UNKNOWN: 0 });
  });
  it("keeps missing inventory as UNKNOWN", () => {
    const result = compareHandoff(capture(), captureHandoff(manifest, null, later));
    expect(result.status).toBe("UNKNOWN");
    expect(result.rows.every((row) => row.change === "UNKNOWN")).toBe(true);
  });
  it("flags unexpected source metadata changes", () => {
    const updated: RegionManifest = { ...manifest, cells: [
      { ...manifest.cells[0], provenance: { ...source, date: "2026-11-02" } }, ...manifest.cells.slice(1),
    ] };
    const value = captureHandoff(updated, null, later);
    expect(compareHandoff(capture(), value).rows[0].change).toBe("UNKNOWN");
  });
  it("does not infer a gain from unreadable to saved", () => {
    const result = compareHandoff(captureHandoff(manifest, inventory(["unreadable", "missing", "missing"]), date),
      captureHandoff(manifest, inventory(["present", "missing", "missing"]), later));
    expect(result.rows[0].change).toBe("changed");
  });
  it("rejects comparisons between regions", () => {
    expect(() => compareHandoff(capture(), { ...after(), regionId: "other" })).toThrow();
  });
  it("rejects reversed timestamps", () => {
    expect(() => compareHandoff(after(), capture())).toThrow();
  });
  it("detects identical observations", () => {
    const result = compareHandoff(capture(), { ...capture(), capturedAt: later });
    expect(result.rows.every((row) => row.change === "unchanged")).toBe(true);
  });
  it("handles added cells as UNKNOWN", () => {
    const added = captureHandoff({ ...manifest, cells: [...manifest.cells,
      { id: "west", bytes: 10, provenance: source }] }, null, later);
    expect(compareHandoff(capture(), added).rows.at(-1)?.change).toBe("UNKNOWN");
  });
  it("handles missing cells as UNKNOWN", () => {
    const removed = captureHandoff({ ...manifest, cells: manifest.cells.slice(0, 1) }, null, later);
    expect(compareHandoff(capture(), removed).rows[1].change).toBe("UNKNOWN");
  });
});

describe("handoff filtering and paging", () => {
  const result = compareHandoff(capture(), after());
  const page = (overrides: Partial<Parameters<typeof pageHandoff>[1]> = {}) => pageHandoff(result, {
    search: "", filter: "all", order: "manifest", offset: 0, limit: 2, ...overrides,
  });
  it("keeps original manifest ordering", () => expect(page().rows.map((row) => row.id)).toEqual(["north", "south"]));
  it("filters missing transitions", () => expect(page({ filter: "lost" }).rows.map((row) => row.id)).toEqual(["north"]));
  it("filters issue rows", () => expect(page({ filter: "attention" }).total).toBe(3));
  it("searches IDs without casing sensitivity", () => expect(page({ search: "NORTH" }).total).toBe(1));
  it("searches provenance", () => expect(page({ search: "ONTARIO" }).total).toBe(3));
  it("supports descending size", () => expect(page({ order: "size" }).rows.map((row) => row.id)).toEqual(["south", "north"]));
  it("supports category ordering", () => expect(page({ order: "state" }).rows[0].change).toBe("changed"));
  it("sets page markers", () => {
    expect(page()).toMatchObject({ total: 3, previous: false, next: true });
    expect(page({ offset: 2 })).toMatchObject({ total: 3, previous: true, next: false });
  });
  it("rejects bad offsets and limits", () => {
    for (const offset of [-1, 0.5, NaN, Infinity]) expect(() => page({ offset })).toThrow();
    for (const limit of [-1, 0, 21, 1.5]) expect(() => page({ limit })).toThrow();
  });
  it("rejects invalid filters and orders", () => {
    expect(() => page({ filter: "other" as "all" })).toThrow();
    expect(() => page({ order: "other" as "manifest" })).toThrow();
  });
});

describe("handoff notes and bounded import", () => {
  it("starts without a later observation", () => {
    expect(startHandoff(capture())).toMatchObject({ after: null, notes: [], regionId: manifest.regionId });
  });
  it("updates a later capture", () => {
    const book = updateHandoff(startHandoff(capture()), after());
    expect(book.after?.capturedAt).toBe(later);
  });
  it("adds notes only for listed cells", () => {
    const book = appendHandoffNote(startHandoff(capture()), note);
    expect(book.notes[0]).toEqual(note);
    expect(() => appendHandoffNote(book, { ...note, id: "note-2", cellId: "unlisted" })).toThrow();
  });
  it("rejects duplicate note identifiers", () => {
    const book = appendHandoffNote(startHandoff(capture()), note);
    expect(() => appendHandoffNote(book, note)).toThrow();
  });
  it("rejects notes that predate the capture", () => {
    expect(() => appendHandoffNote(startHandoff(capture()), { ...note, at: "2026-11-18T12:00:00.000Z" })).toThrow();
  });
  it("rejects oversized and empty notes", () => {
    for (const text of [" ", "x".repeat(1001)]) {
      expect(() => appendHandoffNote(startHandoff(capture()), { ...note, text })).toThrow();
    }
  });
  it("supports explicit resolution changes", () => {
    const book = appendHandoffNote(startHandoff(capture()), note);
    expect(changeHandoffNote(book, note.id, "reviewing").notes[0].resolution).toBe("reviewing");
    expect(changeHandoffNote(book, note.id, "closed").notes[0].resolution).toBe("closed");
    expect(book.notes[0].resolution).toBe("open");
  });
  it("rejects unknown notes", () => {
    expect(() => changeHandoffNote(startHandoff(capture()), "not-found", "closed")).toThrow();
  });
  it("enforces note count", () => {
    const book = { ...startHandoff(capture()), notes: Array.from({ length: HANDOFF_MAX_NOTES }, (_, i) =>
      ({ ...note, id: `note-${i}` })) };
    expect(() => appendHandoffNote(book, { ...note, id: "extra" })).toThrow();
  });
  it("round trips history and notes", () => {
    const book = appendHandoffNote(updateHandoff(startHandoff(capture()), after()), note);
    expect(parseHandoffBook(serializeHandoffBook(book), manifest.regionId)).toEqual(book);
  });
  it("rejects wrong-region imports", () => {
    expect(() => parseHandoffBook(serializeHandoffBook(startHandoff(capture())), "not-this-region")).toThrow();
  });
  it("rejects oversized JSON", () => {
    expect(() => parseHandoffBook("x".repeat(HANDOFF_MAX_JSON_BYTES + 1), manifest.regionId)).toThrow();
  });
  it("rejects invalid JSON and incompatible format", () => {
    expect(() => parseHandoffBook("{", manifest.regionId)).toThrow();
    expect(() => parseHandoffBook('{"format":"other"}', manifest.regionId)).toThrow();
  });
  it("rejects a fabricated saved state", () => {
    const value = structuredClone(capture());
    const invalid = { ...value, cells: [{ ...value.cells[0], cause: "missing" }, ...value.cells.slice(1)] };
    expect(() => validateHandoffCapture(invalid)).toThrow();
  });
  it("rejects capture status inconsistent with unknown data", () => {
    expect(() => validateHandoffCapture({ ...capture(), status: "recorded", cells: [
      { ...capture().cells[0], state: "UNKNOWN", cause: "UNKNOWN" }, ...capture().cells.slice(1),
    ] })).toThrow();
  });
  it("rejects an imported note with invalid category", () => {
    const book = appendHandoffNote(startHandoff(capture()), note);
    const invalid = { ...book, notes: [{ ...note, kind: "unsupported" }] };
    expect(() => parseHandoffBook(JSON.stringify(invalid), manifest.regionId)).toThrow();
  });
  it("rejects tampered timestamps", () => {
    const book = startHandoff(capture());
    expect(() => parseHandoffBook(JSON.stringify({ ...book, startedAt: later }), manifest.regionId)).toThrow();
  });
  it("rejects duplicate imported cell IDs", () => {
    const value = capture();
    const duplicate = { ...value, cells: [value.cells[0], value.cells[0]] };
    expect(() => validateHandoffCapture(duplicate)).toThrow();
  });
  it("rejects unsupported cell states and causes", () => {
    const value = capture();
    const changedState = { ...value, cells: [
      { ...value.cells[0], state: "available" }, ...value.cells.slice(1),
    ] };
    expect(() => validateHandoffCapture(changedState)).toThrow();
    const changedCause = { ...value, cells: [
      { ...value.cells[0], cause: "unproven" }, ...value.cells.slice(1),
    ] };
    expect(() => validateHandoffCapture(changedCause)).toThrow();
  });
  it("rejects incorrect or missing source metadata", () => {
    const value = capture();
    for (const provenance of [
      { ...value.cells[0].source, licence: "" },
      { ...value.cells[0].source, source: "" },
      { ...value.cells[0].source, bytes: -1 },
      { ...value.cells[0].source, date: "2026-13-19" },
    ]) {
      const invalid = { ...value, cells: [{ ...value.cells[0], source: provenance }, ...value.cells.slice(1)] };
      expect(() => validateHandoffCapture(invalid)).toThrow();
    }
  });
  it("rejects control characters inside IDs", () => {
    const value = capture();
    const invalid = { ...value, regionId: "bad\u0000region" };
    expect(() => validateHandoffCapture(invalid)).toThrow();
  });
  it("does not permit an imported empty note or note pointing outside the region", () => {
    const book = startHandoff(capture());
    for (const changed of [
      { ...note, text: "" },
      { ...note, cellId: "another-region" },
    ]) {
      expect(() => parseHandoffBook(JSON.stringify({ ...book, notes: [changed] }), manifest.regionId)).toThrow();
    }
  });
  it("does not permit an unsupported note resolution", () => {
    const book = startHandoff(capture());
    const invalid = { ...book, notes: [{ ...note, resolution: "accepted" }] };
    expect(() => parseHandoffBook(JSON.stringify(invalid), manifest.regionId)).toThrow();
  });
  it("rejects invalid format even when a region ID is present", () => {
    const book = startHandoff(capture());
    expect(() => parseHandoffBook(JSON.stringify({ ...book, format: "legacy" }), manifest.regionId)).toThrow();
  });
  it("handles escaped user text without rewriting it", () => {
    const book = appendHandoffNote(startHandoff(capture()), {
      ...note, text: "A <script> tag is only note text & not executable markup",
    });
    expect(parseHandoffBook(serializeHandoffBook(book), manifest.regionId).notes[0].text).toBe(book.notes[0].text);
  });
  it("returns empty pages beyond the end without changing counts", () => {
    const result = compareHandoff(capture(), after());
    const page = pageHandoff(result, { search: "", filter: "all", order: "manifest", offset: 500, limit: 10 });
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(3);
    expect(page.next).toBe(false);
  });

});
