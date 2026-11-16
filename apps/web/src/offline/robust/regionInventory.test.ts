import { describe, expect, it, vi } from "vitest";
import { inspectRegion, inventoryCounts, inventoryPage, provenanceOf } from "./regionInventory.ts";
import { type CellStore, type RegionManifest, type StoredCell } from "./regionDownload.ts";

const p = { source: "Municipal open data", licence: "CC BY 4.0", date: "2026-11-01" };
const manifest: RegionManifest = {
  regionId: "sample",
  cells: [
    { id: "north", bytes: 2, provenance: p },
    { id: "south", bytes: 3, provenance: p },
    { id: "east", bytes: 0, provenance: p },
  ],
};

function fixture() {
  const values = new Map<string, StoredCell>();
  const unreadable = new Set<string>();
  const store: CellStore = {
    async get(_region, cell) {
      if (unreadable.has(cell)) throw new Error("read failed");
      return values.get(cell);
    },
    async put(_region, cell, value) { values.set(cell, value); },
  };
  return { store, values, unreadable };
}

describe("region inventory", () => {
  it("starts with UNKNOWN for every unlisted local copy", async () => {
    const { store } = fixture();
    const snapshot = await inspectRegion(manifest, store);
    expect(snapshot.complete).toBe(false);
    expect(snapshot.unknownCount).toBe(3);
    expect(snapshot.savedBytes).toBe(0);
    expect(snapshot.expectedBytes).toBe(5);
    expect(snapshot.cells.map((cell) => cell.cause)).toEqual(["missing", "missing", "missing"]);
  });

  it("distinguishes saved, stale, and unreadable cells", async () => {
    const { store, values, unreadable } = fixture();
    values.set("north", { bytes: 2, provenance: p });
    values.set("south", { bytes: 2, provenance: p });
    unreadable.add("east");
    const snapshot = await inspectRegion(manifest, store);
    expect(snapshot.cells.map((cell) => cell.cause)).toEqual(["present", "stale", "unreadable"]);
    expect(snapshot.cells.map((cell) => cell.state)).toEqual(["saved", "unknown", "unknown"]);
    expect(snapshot.savedCount).toBe(1);
    expect(snapshot.unknownCount).toBe(2);
    expect(snapshot.savedBytes).toBe(2);
  });

  it("invalidates changed source, licence or date", async () => {
    const { store, values } = fixture();
    for (const field of ["source", "licence", "date"] as const) {
      values.set("north", {
        bytes: 2,
        provenance: { ...p, [field]: "changed" },
      });
      expect((await inspectRegion(manifest, store)).cells[0]?.cause).toBe("stale");
    }
  });

  it("handles zero-byte cells without claiming missing ones are present", async () => {
    const { store, values } = fixture();
    values.set("east", { bytes: 0, provenance: p });
    const snapshot = await inspectRegion(manifest, store);
    expect(snapshot.cells[2]?.state).toBe("saved");
    expect(snapshot.complete).toBe(false);
  });

  it("reports each inspected cell for optional progress UI", async () => {
    const { store } = fixture();
    const onProgress = vi.fn();
    await inspectRegion(manifest, store, { onProgress });
    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([
      { inspected: 1, total: 3 },
      { inspected: 2, total: 3 },
      { inspected: 3, total: 3 },
    ]);
  });

  it("supports cancellation before reading", async () => {
    const { store } = fixture();
    const abort = new AbortController();
    abort.abort();
    await expect(inspectRegion(manifest, store, { signal: abort.signal })).rejects.toThrow(
      "Inventory interrupted",
    );
  });

  it("pages without changing the manifest order", async () => {
    const { store } = fixture();
    const snapshot = await inspectRegion(manifest, store);
    expect(inventoryPage(snapshot, 1, 2).map((cell) => cell.id)).toEqual(["south", "east"]);
    expect(inventoryPage(snapshot, 3, 2)).toEqual([]);
    expect(() => inventoryPage(snapshot, -1, 2)).toThrow(RangeError);
    expect(() => inventoryPage(snapshot, 0, 0)).toThrow(RangeError);
    expect(() => inventoryPage(snapshot, 0, 101)).toThrow(RangeError);
  });

  it("provides counts and provenance only for listed cells", async () => {
    const { store } = fixture();
    const snapshot = await inspectRegion(manifest, store);
    expect(inventoryCounts(snapshot)).toEqual({ saved: 0, unknown: 3, total: 3 });
    expect(provenanceOf(snapshot, "north")).toEqual(p);
    expect(provenanceOf(snapshot, "unlisted")).toBeNull();
  });

  it("rejects duplicated IDs and invalid metadata", async () => {
    const { store } = fixture();
    await expect(inspectRegion({ ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] }, store))
      .rejects.toThrow("Invalid inventory manifest");
    await expect(inspectRegion({ ...manifest, cells: [{
      id: "bad", bytes: 3, provenance: { ...p, licence: "" },
    }] }, store)).rejects.toThrow("Invalid inventory manifest");
  });

  it("represents an empty listing separately from spatial coverage", async () => {
    const { store } = fixture();
    const snapshot = await inspectRegion({ regionId: "empty", cells: [] }, store);
    expect(snapshot.cells).toEqual([]);
    expect(snapshot.complete).toBe(true);
    expect(snapshot.expectedBytes).toBe(0);
  });
});
