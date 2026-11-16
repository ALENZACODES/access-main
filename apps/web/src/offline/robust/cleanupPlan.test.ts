import { describe, expect, it } from "vitest";
import {
  allowedCleanupIds, boundedCleanupSelection, browseCleanup,
  groupCleanupSources, MAX_CLEANUP_SELECTION, planCellCleanup,
  reconcileCleanupSelection,
} from "./cleanupPlan";
import { type RegionInventory, type InventoryCell } from "./regionInventory";
import { type RegionManifest, type Provenance } from "./regionDownload";

const origin: Provenance = { source: "Ontario public listing", licence: "CC BY 4.0", date: "2026-04-01" };
const alternate: Provenance = { source: "Community open data", licence: "CC0 1.0", date: "2025-03-02" };
const manifest: RegionManifest = {
  regionId: "region-one",
  cells: [
    { id: "a", bytes: 10, provenance: origin },
    { id: "b", bytes: 30, provenance: origin },
    { id: "c", bytes: 5, provenance: alternate },
    { id: "d", bytes: 100, provenance: alternate },
    { id: "e", bytes: 0, provenance: origin },
  ],
};
const inventory: RegionInventory = {
  regionId: "region-one",
  cells: [
    { id: "a", state: "saved", cause: "present", expectedBytes: 10, provenance: origin },
    { id: "b", state: "unknown", cause: "stale", expectedBytes: 30, provenance: origin },
    { id: "c", state: "unknown", cause: "missing", expectedBytes: 5, provenance: alternate },
    { id: "d", state: "unknown", cause: "unreadable", expectedBytes: 100, provenance: alternate },
    { id: "e", state: "saved", cause: "present", expectedBytes: 0, provenance: origin },
  ],
  savedCount: 2, unknownCount: 3, savedBytes: 10,
  expectedBytes: 145, complete: false,
};

function withCells(cells: readonly InventoryCell[]): RegionInventory {
  return { ...inventory, cells };
}

describe("cleanup preview is confined to an explicit region manifest", () => {
  it("cannot preview a missing cell for removal", () => {
    const preview = planCellCleanup(manifest, inventory, ["c"]);
    expect(preview.ready).toBe(true);
    expect(preview.candidates).toHaveLength(1);
    expect(preview.removableCount).toBe(0);
    expect(allowedCleanupIds(preview)).toEqual([]);
  });

  it("retains the UNKNOWN distinction for stale and unreadable copies", () => {
    const preview = planCellCleanup(manifest, inventory, ["a", "b", "d"]);
    expect(preview.ready).toBe(true);
    expect(preview.savedCount).toBe(1);
    expect(preview.unknownCount).toBe(2);
    expect(preview.candidates.map((cell) => cell.reason)).toEqual(["saved", "stale", "unreadable"]);
    expect(allowedCleanupIds(preview)).toEqual(["a", "b", "d"]);
  });

  it("counts listed bytes without treating them as available storage", () => {
    const preview = planCellCleanup(manifest, inventory, ["a", "b", "c", "d"]);
    expect(preview.possibleBytes).toBe(140);
    expect(preview.bytesKnown).toBe(true);
    expect(preview.removableCount).toBe(3);
  });

  it("counts a zero byte saved cell as removable", () => {
    const preview = planCellCleanup(manifest, inventory, ["e"]);
    expect(allowedCleanupIds(preview)).toEqual(["e"]);
    expect(preview.possibleBytes).toBe(0);
  });

  it("keeps input selection from promoting unlisted IDs", () => {
    const preview = planCellCleanup(manifest, inventory, ["outside", "a"]);
    expect(preview.candidates.map((cell) => cell.id)).toEqual(["a"]);
    expect(preview.requestedCount).toBe(2);
  });

  it("blocks a region mismatch even when cell identifiers match", () => {
    const preview = planCellCleanup(manifest, { ...inventory, regionId: "another" }, ["a"]);
    expect(preview.ready).toBe(false);
    expect(preview.findings).toContainEqual({ code: "region-mismatch", cellId: null });
    expect(allowedCleanupIds(preview)).toEqual([]);
  });

  it("rejects duplicate manifest identifiers", () => {
    const duplicated: RegionManifest = { ...manifest, cells: [...manifest.cells, manifest.cells[0]!] };
    const preview = planCellCleanup(duplicated, inventory, ["a"]);
    expect(preview.ready).toBe(false);
    expect(preview.findings).toContainEqual({ code: "duplicate-manifest", cellId: "a" });
  });

  it("rejects duplicate inventory identifiers", () => {
    const duplicated = withCells([...inventory.cells, inventory.cells[0]!]);
    const preview = planCellCleanup(manifest, duplicated, ["a"]);
    expect(preview.ready).toBe(false);
    expect(preview.findings).toContainEqual({ code: "duplicate-inventory", cellId: "a" });
  });

  it("rejects unlisted inventory cells", () => {
    const extra: InventoryCell = { id: "outsider", state: "saved", cause: "present", expectedBytes: 5, provenance: origin };
    const preview = planCellCleanup(manifest, withCells([...inventory.cells, extra]), ["a"]);
    expect(preview.ready).toBe(false);
    expect(preview.findings).toContainEqual({ code: "unlisted-cell", cellId: "outsider" });
  });

  it("rejects cells absent from the inventory", () => {
    const preview = planCellCleanup(manifest, withCells(inventory.cells.slice(1)), ["b"]);
    expect(preview.ready).toBe(false);
    expect(preview.findings).toContainEqual({ code: "manifest-mismatch", cellId: "a" });
  });

  it("rejects changed expected byte counts", () => {
    const changed = inventory.cells.map((c) => c.id === "a" ? { ...c, expectedBytes: 22 } : c);
    expect(planCellCleanup(manifest, withCells(changed), ["a"]).ready).toBe(false);
  });

  it("rejects changed provenance dates", () => {
    const changed = inventory.cells.map((c) => c.id === "a" ? {
      ...c, provenance: { ...origin, date: "2026-03-31" },
    } : c);
    expect(planCellCleanup(manifest, withCells(changed), ["a"]).ready).toBe(false);
  });

  it("rejects changed provenance licences", () => {
    const changed = inventory.cells.map((c) => c.id === "a" ? {
      ...c, provenance: { ...origin, licence: "Other licence" },
    } : c);
    expect(planCellCleanup(manifest, withCells(changed), ["a"]).ready).toBe(false);
  });

  it("rejects changed provenance source names", () => {
    const changed = inventory.cells.map((c) => c.id === "a" ? {
      ...c, provenance: { ...origin, source: "Different source" },
    } : c);
    expect(planCellCleanup(manifest, withCells(changed), ["a"]).ready).toBe(false);
  });

  it("rejects missing provenance", () => {
    const invalid: RegionManifest = { ...manifest, cells: [
      { ...manifest.cells[0]!, provenance: { ...origin, source: "" } },
      ...manifest.cells.slice(1),
    ] };
    expect(planCellCleanup(invalid, inventory, ["a"]).findings)
      .toContainEqual({ code: "invalid-provenance", cellId: "a" });
  });

  it("rejects negative byte size", () => {
    const invalid: RegionManifest = { ...manifest, cells: [
      { ...manifest.cells[0]!, bytes: -1 }, ...manifest.cells.slice(1),
    ] };
    expect(planCellCleanup(invalid, inventory, ["a"]).findings)
      .toContainEqual({ code: "invalid-size", cellId: "a" });
  });

  it("rejects fractional byte size", () => {
    const invalid: RegionManifest = { ...manifest, cells: [
      { ...manifest.cells[0]!, bytes: 1.5 }, ...manifest.cells.slice(1),
    ] };
    expect(planCellCleanup(invalid, inventory, ["a"]).ready).toBe(false);
  });

  it("rejects byte sums above safe integer capacity", () => {
    const huge: RegionManifest = { regionId: manifest.regionId, cells: [
      { id: "a", bytes: Number.MAX_SAFE_INTEGER, provenance: origin },
      { id: "b", bytes: 4, provenance: origin },
    ] };
    const present: RegionInventory = { ...inventory, cells: [
      { id: "a", state: "saved", cause: "present", expectedBytes: Number.MAX_SAFE_INTEGER, provenance: origin },
      { id: "b", state: "saved", cause: "present", expectedBytes: 4, provenance: origin },
    ] };
    const preview = planCellCleanup(huge, present, ["a", "b"]);
    expect(preview.bytesKnown).toBe(false);
    expect(preview.possibleBytes).toBe(0);
  });
});

describe("cleanup browsing is deterministic and display-only", () => {
  it("retains the manifest order by default", () => {
    expect(browseCleanup(inventory).cells.map((c) => c.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("filters saved copies only", () => {
    expect(browseCleanup(inventory, { filter: "saved" }).cells.map((c) => c.id)).toEqual(["a", "e"]);
  });
  it("filters UNKNOWN without promoting missing copies", () => {
    const cells = browseCleanup(inventory, { filter: "unknown" }).cells;
    expect(cells.map((c) => c.id)).toEqual(["b", "c", "d"]);
    expect(cells.find((c) => c.id === "c")?.removable).toBe(false);
  });
  it("filters stale records", () => {
    expect(browseCleanup(inventory, { filter: "stale" }).cells.map((c) => c.id)).toEqual(["b"]);
  });
  it("filters unreadable records", () => {
    expect(browseCleanup(inventory, { filter: "unreadable" }).cells.map((c) => c.id)).toEqual(["d"]);
  });
  it("searches cell IDs case-insensitively", () => {
    expect(browseCleanup(inventory, { text: " A " }).cells.map((c) => c.id)).toEqual(["a"]);
  });
  it("searches source names", () => {
    expect(browseCleanup(inventory, { text: "community" }).cells.map((c) => c.id)).toEqual(["c", "d"]);
  });
  it("searches licences", () => {
    expect(browseCleanup(inventory, { text: "cc0" }).matched).toBe(2);
  });
  it("searches dates", () => {
    expect(browseCleanup(inventory, { text: "2026-04" }).matched).toBe(3);
  });
  it("sorts largest first without changing the input inventory", () => {
    expect(browseCleanup(inventory, { order: "largest" }).cells.map((c) => c.id)).toEqual(["d", "b", "a", "c", "e"]);
    expect(inventory.cells[0]?.id).toBe("a");
  });
  it("sorts smallest first", () => {
    expect(browseCleanup(inventory, { order: "smallest" }).cells.map((c) => c.id)).toEqual(["e", "c", "a", "b", "d"]);
  });
  it("sorts by source", () => {
    expect(browseCleanup(inventory, { order: "source" }).cells.map((c) => c.id)).toEqual(["c", "d", "a", "b", "e"]);
  });
  it("clamps negative page numbers", () => {
    expect(browseCleanup(inventory, { page: -10, pageSize: 2 }).page).toBe(0);
  });
  it("clamps page numbers above the last page", () => {
    expect(browseCleanup(inventory, { page: 100, pageSize: 2 }).page).toBe(2);
  });
  it("paginates without duplicate cells", () => {
    const ids = [0, 1, 2].flatMap((page) => browseCleanup(inventory, { page, pageSize: 2 }).cells.map((c) => c.id));
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("reports empty page bounds accurately", () => {
    const result = browseCleanup(inventory, { text: "not-here" });
    expect(result).toMatchObject({ matched: 0, first: 0, last: 0, pages: 1 });
  });
  it("rejects a zero page size", () => {
    expect(() => browseCleanup(inventory, { pageSize: 0 })).toThrow(RangeError);
  });
  it("rejects an excessive page size", () => {
    expect(() => browseCleanup(inventory, { pageSize: 101 })).toThrow(RangeError);
  });
  it("rejects a fractional page size", () => {
    expect(() => browseCleanup(inventory, { pageSize: 1.2 })).toThrow(RangeError);
  });
});

describe("cleanup selection boundaries", () => {
  it("only selects cells that have stored copies", () => {
    expect(boundedCleanupSelection(inventory, ["a", "c", "d", "outsider"])).toEqual(["a", "d"]);
  });
  it("deduplicates selections while retaining order", () => {
    expect(boundedCleanupSelection(inventory, ["b", "a", "b", "a"])).toEqual(["b", "a"]);
  });
  it("reconciles selections after a copy disappears", () => {
    const changed = withCells(inventory.cells.map((c) => c.id === "a" ? {
      ...c, state: "unknown" as const, cause: "missing" as const,
    } : c));
    expect(reconcileCleanupSelection(changed, ["a", "b"])).toEqual(["b"]);
  });
  it("limits the maximum number of selected records", () => {
    const cells: InventoryCell[] = Array.from({ length: 400 }, (_, index) => ({
      id: `cell-${index}`, state: "saved", cause: "present", expectedBytes: 1, provenance: origin,
    }));
    const ids = boundedCleanupSelection(withCells(cells), cells.map((c) => c.id));
    expect(ids).toHaveLength(MAX_CLEANUP_SELECTION);
  });
  it("accepts a narrower selection limit", () => {
    expect(boundedCleanupSelection(inventory, ["a", "b", "d"], 2)).toEqual(["a", "b"]);
  });
  it("rejects invalid selection limits", () => {
    expect(() => boundedCleanupSelection(inventory, ["a"], 0)).toThrow(RangeError);
    expect(() => boundedCleanupSelection(inventory, ["a"], 500)).toThrow(RangeError);
  });
  it("does not mutate supplied selection arrays", () => {
    const original = ["a", "a", "b"];
    boundedCleanupSelection(inventory, original);
    expect(original).toEqual(["a", "a", "b"]);
  });
});

describe("source summary keeps separate licences and dates", () => {
  it("groups only identical source, licence and date", () => {
    const groups = groupCleanupSources(inventory);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.source === origin.source)).toMatchObject({
      licence: origin.licence, date: origin.date, savedCount: 2, unknownCount: 1,
      expectedBytes: 40,
    });
  });
  it("does not collapse the same source with a different date", () => {
    const changed = withCells(inventory.cells.map((c) => c.id === "a" ? {
      ...c, provenance: { ...origin, date: "2026-05-01" },
    } : c));
    expect(groupCleanupSources(changed)).toHaveLength(3);
  });
  it("does not collapse the same source with a different licence", () => {
    const changed = withCells(inventory.cells.map((c) => c.id === "a" ? {
      ...c, provenance: { ...origin, licence: "CC0 1.0" },
    } : c));
    expect(groupCleanupSources(changed)).toHaveLength(3);
  });
});
