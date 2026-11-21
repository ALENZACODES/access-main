import { describe, expect, it } from "vitest";
import type { Provenance, RegionManifest } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import {
  DEFAULT_DRILL_SETTINGS, pageContinuityDrill, runContinuityDrill,
  type DrillSettings,
} from "./continuityDrill";

const open: Provenance = { source: "Local open records", licence: "CC0 1.0", date: "2026-09-09" };
const other: Provenance = { source: "Other open records", licence: "CC BY 4.0", date: "2023-01-01" };
const cell = (id: string, bytes: number, provenance: Provenance = open) => ({ id, bytes, provenance });
const stored = (id: string, bytes: number, provenance: Provenance = open): InventoryCell => ({
  id, expectedBytes: bytes, provenance, state: "saved", cause: "present",
});
const listed = (cells: RegionManifest["cells"]): RegionManifest => ({ regionId: "sample", cells });
function read(cells: readonly InventoryCell[]): RegionInventory {
  const saved = cells.filter((item) => item.state === "saved");
  return {
    regionId: "sample", cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((total, item) => total + item.expectedBytes, 0),
    expectedBytes: cells.reduce((total, item) => total + item.expectedBytes, 0),
    complete: saved.length === cells.length,
  };
}
function config(scenario: DrillSettings["scenario"], affectedCount = 1,
  reductionBytes = 0, preserveReserveBytes = 0): DrillSettings {
  return { scenario, affectedCount, reductionBytes, preserveReserveBytes };
}
const baseline = (manifest: RegionManifest, inventory: RegionInventory | null) =>
  runContinuityDrill(manifest, inventory, DEFAULT_DRILL_SETTINGS);

describe("continuity edge cases on the current public API", () => {
  it("accepts empty manifest and empty inventory", () => {
    const outcome = baseline(listed([]), read([]));
    expect(outcome.cells).toEqual([]);
    expect(outcome.beforeSaved).toBe(0);
    expect(outcome.afterSaved).toBe(0);
  });
  it("counts an exact saved copy", () => {
    const outcome = baseline(listed([cell("one", 1)]), read([stored("one", 1)]));
    expect(outcome.status).toBe("complete");
    expect(outcome.beforeSaved).toBe(1);
  });
  it("changes a selected copy only in hypothetical output", () => {
    const copies = read([stored("one", 1)]);
    const outcome = runContinuityDrill(listed([cell("one", 1)]), copies, config("evict-largest"));
    expect(outcome.cells[0]?.before).toBe("saved");
    expect(outcome.cells[0]?.after).toBe("UNKNOWN");
    expect(outcome.cells[0]?.reason).toBe("simulated-loss");
    expect(copies.cells[0]?.state).toBe("saved");
  });
  it("handles a zero-byte copy without a negative count", () => {
    const outcome = runContinuityDrill(listed([cell("zero", 0)]), read([stored("zero", 0)]), config("evict-largest"));
    expect(outcome.affected).toBe(1);
    expect(outcome.afterSaved).toBe(0);
  });
  it("distinguishes source drift from a saved copy", () => {
    const outcome = baseline(listed([cell("one", 10)]), read([stored("one", 10, other)]));
    expect(outcome.cells[0]?.before).toBe("UNKNOWN");
    expect(outcome.cells[0]?.reason).toBe("UNKNOWN");
  });
  it("treats byte mismatch as UNKNOWN", () => {
    const outcome = baseline(listed([cell("one", 10)]), read([stored("one", 9)]));
    expect(outcome.cells[0]?.after).toBe("UNKNOWN");
  });
  it("does not infer a missing cause from an absent observation", () => {
    const outcome = baseline(listed([cell("one", 10)]), read([]));
    expect(outcome.status).toBe("UNKNOWN");
    expect(outcome.cells[0]?.reason).toBe("UNKNOWN");
  });
  for (const cause of ["missing", "stale", "unreadable"] as const) {
    it(`preserves the observed ${cause} reason`, () => {
      const observation: InventoryCell = { ...stored("one", 10), state: "unknown", cause };
      const outcome = baseline(listed([cell("one", 10)]), read([observation]));
      expect(outcome.cells[0]?.reason).toBe(cause);
      expect(outcome.cells[0]?.after).toBe("UNKNOWN");
    });
  }
  it("never evicts unreadable copies", () => {
    const observation: InventoryCell = { ...stored("one", 10), state: "unknown", cause: "unreadable" };
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([observation]), config("evict-largest"));
    expect(outcome.affected).toBe(0);
  });
  it("keeps source metadata after hypothetical change", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10, other)]), read([stored("one", 10, other)]), config("source-change"));
    expect(outcome.cells[0]?.source).toBe(other.source);
    expect(outcome.cells[0]?.licence).toBe(other.licence);
    expect(outcome.cells[0]?.date).toBe(other.date);
    expect(outcome.cells[0]?.reason).toBe("simulated-source-change");
  });
  it("does not invent capacity when no estimate is supplied", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 10)]), config("quota-reduction"));
    expect(outcome.quota).toBeNull();
    expect(outcome.status).toBe("UNKNOWN");
  });
  it("interprets zero free bytes without inventing extra space", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 10)]),
      config("baseline"), { quota: 0, usage: 0 });
    expect(outcome.quota).toBe(0);
  });
  it("rejects invalid quota estimates conservatively", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 10)]),
      config("quota-reduction"), { quota: Number.NaN, usage: 0 });
    expect(outcome.status).toBe("UNKNOWN");
  });
  it("does not classify quota simulation as an actual removal", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 10)]),
      config("quota-reduction", 0, 100, 0), { quota: 100, usage: 90 });
    expect(outcome.cells[0]?.reason).toBe("simulated-loss");
    expect(outcome.cells[0]?.before).toBe("saved");
  });
  it("preserves deterministic source fields across pages", () => {
    const manifest = listed([cell("one", 10, open), cell("two", 20, other)]);
    const original = baseline(manifest, read([stored("one", 10, open), stored("two", 20, other)]));
    pageContinuityDrill(original, { filter: "all", sort: "bytes-desc", search: "", offset: 0, limit: 1 });
    expect(original.cells.map((entry) => entry.source)).toEqual([open.source, other.source]);
  });
  it("keeps original order after a sorted page", () => {
    const manifest = listed([cell("small", 1), cell("large", 100)]);
    const result = baseline(manifest, read([stored("small", 1), stored("large", 100)]));
    const sorted = pageContinuityDrill(result, { filter: "all", sort: "bytes-desc", search: "", offset: 0, limit: 2 });
    const original = pageContinuityDrill(result, { filter: "all", sort: "listed", search: "", offset: 0, limit: 2 });
    expect(sorted.rows.map((entry) => entry.id)).toEqual(["large", "small"]);
    expect(original.rows.map((entry) => entry.id)).toEqual(["small", "large"]);
  });
  it("does not exceed the original saved count on simulated losses", () => {
    const cells = [cell("a", 120), cell("b", 80), cell("c", 60), cell("d", 40)];
    const outcome = runContinuityDrill(listed(cells), read(cells.map((entry) => stored(entry.id, entry.bytes))),
      config("evict-largest", 2));
    expect(outcome.affected).toBe(2);
    expect(outcome.afterSaved).toBe(2);
    expect(outcome.affected <= outcome.beforeSaved).toBe(true);
    expect(outcome.cells.filter((entry) => entry.affected).map((entry) => entry.id)).toEqual(["a", "b"]);
  });
  it("keeps pagination bounded", () => {
    const entries = [cell("a", 10), cell("b", 20), cell("c", 30)];
    const result = baseline(listed(entries), read(entries.map((entry) => stored(entry.id, entry.bytes))));
    const first = pageContinuityDrill(result, { filter: "all", sort: "listed", search: "", offset: 0, limit: 2 });
    const last = pageContinuityDrill(result, { filter: "all", sort: "listed", search: "", offset: 2, limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.next).toBe(true);
    expect(last.rows).toHaveLength(1);
    expect(last.next).toBe(false);
  });
  it("rejects invalid page inputs", () => {
    const result = baseline(listed([]), read([]));
    for (const offset of [-1, 0.5, Number.NaN]) {
      expect(() => pageContinuityDrill(result, { filter: "all", sort: "listed", search: "", offset, limit: 1 })).toThrow();
    }
    for (const limit of [0, 101, 1.5]) {
      expect(() => pageContinuityDrill(result, { filter: "all", sort: "listed", search: "", offset: 0, limit })).toThrow();
    }
  });
});
