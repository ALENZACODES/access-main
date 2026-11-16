import { describe, expect, it } from "vitest";
import {
  isTriageFilter, isTriageOrder, matchingCellIds, normaliseTriageQuery,
  reconcileTriageSelection, selectableIds, selectedDownloadPlan,
  triageCauseGroups, triageCounts, triagePage,
  type TriageFilter, type TriageOrder, type TriageQuery,
} from "./cellTriage";
import { type RegionInventory, type InventoryCell } from "./regionInventory";
import { type RegionManifest } from "./regionDownload";

const provenance = { source: "Ontario open dataset", licence: "CC BY 4.0", date: "2026-01-15" };
const second = { source: "Municipal survey", licence: "CC0 1.0", date: "2025-12-01" };
const third = { source: "Regional public map", licence: "Open Government Licence – Ontario", date: "2024-06-14" };
const cells: readonly InventoryCell[] = [
  { id: "z11", expectedBytes: 500, state: "unknown", cause: "missing", provenance },
  { id: "a12", expectedBytes: 100, state: "saved", cause: "present", provenance: second },
  { id: "b13", expectedBytes: 300, state: "unknown", cause: "stale", provenance: third },
  { id: "c14", expectedBytes: 800, state: "unknown", cause: "unreadable", provenance: second },
  { id: "d15", expectedBytes: 20, state: "saved", cause: "present", provenance },
  { id: "e16", expectedBytes: 0, state: "unknown", cause: "missing", provenance: third },
  { id: "f17", expectedBytes: 200, state: "saved", cause: "present", provenance: third },
  { id: "g18", expectedBytes: 60, state: "unknown", cause: "stale", provenance: second },
];
const inventory: RegionInventory = {
  regionId: "north", cells, savedCount: 3, unknownCount: 5,
  savedBytes: 320, expectedBytes: 1980, complete: false,
};
const manifest: RegionManifest = {
  regionId: "north",
  cells: cells.map((cell) => ({ id: cell.id, bytes: cell.expectedBytes, provenance: cell.provenance })),
};
const defaultQuery = { text: "", filter: "all" as const, order: "manifest" as const, page: 0, pageSize: 3 };

function query(overrides: Partial<TriageQuery> = {}): TriageQuery {
  return { ...defaultQuery, ...overrides };
}

describe("triage search and filtering", () => {
  it("keeps the original manifest order by default", () => {
    expect(triagePage(inventory, query()).cells.map((cell) => cell.id)).toEqual(["z11", "a12", "b13"]);
  });

  it("returns the exact matching count and range", () => {
    expect(triagePage(inventory, query())).toMatchObject({
      matched: 8, total: 8, pages: 3, page: 0, start: 1, end: 3,
    });
  });

  it("paginates without accidentally repeating cells", () => {
    const result = [0, 1, 2].flatMap((page) => triagePage(inventory, query({ page })).cells.map((cell) => cell.id));
    expect(result).toEqual(cells.map((cell) => cell.id));
  });

  it("clamps an out-of-range page to the last available page", () => {
    expect(triagePage(inventory, query({ page: 20 }))).toMatchObject({ page: 2, start: 7, end: 8 });
  });

  it("returns one empty page when the query has no matches", () => {
    const result = triagePage(inventory, query({ text: "does-not-exist", page: 10 }));
    expect(result).toMatchObject({ matched: 0, pages: 1, page: 0, start: 0, end: 0 });
    expect(result.cells).toEqual([]);
  });

  it("allows empty region inventories", () => {
    const result = triagePage({ ...inventory, cells: [] }, query());
    expect(result.total).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.pages).toBe(1);
  });

  it("filters UNKNOWN without changing the underlying inventory", () => {
    const result = triagePage(inventory, query({ filter: "unknown", pageSize: 100 }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["z11", "b13", "c14", "e16", "g18"]);
    expect(inventory.cells).toEqual(cells);
  });

  it("filters saved copies independently from UNKNOWN", () => {
    const result = triagePage(inventory, query({ filter: "saved", pageSize: 100 }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["a12", "d15", "f17"]);
    expect(result.matchedUnknown).toBe(0);
  });

  it("distinguishes absent copies from stale and unreadable copies", () => {
    expect(triagePage(inventory, query({ filter: "missing" })).cells.map((cell) => cell.id)).toEqual(["z11", "e16"]);
    expect(triagePage(inventory, query({ filter: "stale" })).cells.map((cell) => cell.id)).toEqual(["b13", "g18"]);
    expect(triagePage(inventory, query({ filter: "unreadable" })).cells.map((cell) => cell.id)).toEqual(["c14"]);
  });

  it("searches source names", () => {
    expect(matchingCellIds(inventory, "Municipal")).toEqual(["a12", "c14", "g18"]);
  });

  it("searches licence strings", () => {
    expect(matchingCellIds(inventory, "CC0 1.0")).toEqual(["a12", "c14", "g18"]);
  });

  it("searches source dates", () => {
    expect(matchingCellIds(inventory, "2024-06")).toEqual(["b13", "e16", "f17"]);
  });

  it("searches cell identifiers", () => {
    expect(matchingCellIds(inventory, "G18")).toEqual(["g18"]);
  });

  it("combines source search with a status filter", () => {
    const result = triagePage(inventory, query({ text: "municipal", filter: "unknown" }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["c14", "g18"]);
  });

  it("combines licence search with cause filter", () => {
    const result = triagePage(inventory, query({ text: "CC BY", filter: "missing" }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["z11"]);
  });

  it("does not search place accessibility fields", () => {
    expect(matchingCellIds(inventory, "ramp")).toEqual([]);
    expect(matchingCellIds(inventory, "accessible")).toEqual([]);
  });

  it("normalises Unicode width and repeated whitespace", () => {
    expect(normaliseTriageQuery("  ＣＣ   ＢＹ  ")).toBe("cc by");
    expect(matchingCellIds(inventory, " ＣＣ   ＢＹ ")).toEqual(["z11", "d15"]);
  });

  it("does not interpret a missing match as a saved cell", () => {
    const result = triagePage(inventory, query({ text: "unused" }));
    expect(result.matchedUnknown).toBe(0);
    expect(result.cells).toEqual([]);
  });

  it("caps enormous search strings", () => {
    expect(normaliseTriageQuery("X".repeat(10000))).toHaveLength(160);
  });

  it("sorts identifiers without modifying the manifest order", () => {
    const result = triagePage(inventory, query({ order: "id", pageSize: 100 }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["a12", "b13", "c14", "d15", "e16", "f17", "g18", "z11"]);
    expect(cells[0]?.id).toBe("z11");
  });

  it("sorts descending by expected bytes", () => {
    const result = triagePage(inventory, query({ order: "largest", pageSize: 100 }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["c14", "z11", "b13", "f17", "a12", "g18", "d15", "e16"]);
  });

  it("sorts ascending by expected bytes including zero", () => {
    const result = triagePage(inventory, query({ order: "smallest", pageSize: 100 }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["e16", "d15", "g18", "a12", "f17", "b13", "z11", "c14"]);
  });

  it("sorts alphabetically by source with deterministic ID ties", () => {
    const result = triagePage(inventory, query({ order: "source", pageSize: 100 }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["a12", "c14", "g18", "d15", "z11", "b13", "e16", "f17"]);
  });

  it("sorts by newest source date without manufacturing recency", () => {
    const result = triagePage(inventory, query({ order: "date", pageSize: 100 }));
    expect(result.cells.map((cell) => cell.id)).toEqual(["d15", "z11", "a12", "c14", "g18", "b13", "e16", "f17"]);
  });

  it("computes byte totals over all matches, not only the first page", () => {
    const result = triagePage(inventory, query({ pageSize: 1 }));
    expect(result.matchedBytes).toBe(1980);
    expect(result.matchedUnknownBytes).toBe(1660);
    expect(result.matchedUnknown).toBe(5);
  });

  it("computes byte totals for just the current filter", () => {
    const result = triagePage(inventory, query({ filter: "stale" }));
    expect(result.matchedBytes).toBe(360);
    expect(result.matchedUnknownBytes).toBe(360);
    expect(result.matchedUnknown).toBe(2);
  });

  it("has no unknown byte total for saved-only matches", () => {
    const result = triagePage(inventory, query({ filter: "saved" }));
    expect(result.matchedUnknownBytes).toBe(0);
    expect(result.matchedBytes).toBe(320);
  });

  it("rejects invalid page size zero", () => {
    expect(() => triagePage(inventory, query({ pageSize: 0 }))).toThrow(RangeError);
  });

  it("rejects huge page sizes", () => {
    expect(() => triagePage(inventory, query({ pageSize: 101 }))).toThrow(RangeError);
  });

  it("rejects fractional page sizes", () => {
    expect(() => triagePage(inventory, query({ pageSize: 2.5 }))).toThrow(RangeError);
  });

  it("rejects a negative page", () => {
    expect(() => triagePage(inventory, query({ page: -1 }))).toThrow(RangeError);
  });

  it("rejects a fractional page", () => {
    expect(() => triagePage(inventory, query({ page: 0.25 }))).toThrow(RangeError);
  });

  it("rejects an invalid filter at runtime", () => {
    expect(() => triagePage(inventory, { ...query(), filter: "accessibility" as TriageFilter })).toThrow(TypeError);
  });

  it("rejects an invalid order at runtime", () => {
    expect(() => triagePage(inventory, { ...query(), order: "distance" as TriageOrder })).toThrow(TypeError);
  });
});

describe("triage selection and explicit subset downloads", () => {
  it("accepts only UNKNOWN IDs from the current inventory", () => {
    expect(selectableIds(inventory, ["a12", "z11", "b13", "unlisted"])).toEqual(["z11", "b13"]);
  });

  it("deduplicates repeated requests", () => {
    expect(selectableIds(inventory, ["z11", "z11", "z11"])).toEqual(["z11"]);
  });

  it("orders IDs by manifest rather than user input", () => {
    expect(selectableIds(inventory, ["g18", "e16", "b13"])).toEqual(["b13", "e16", "g18"]);
  });

  it("returns empty selection for saved cells", () => {
    expect(selectableIds(inventory, ["a12", "d15", "f17"])).toEqual([]);
  });

  it("returns empty selection for unlisted cells", () => {
    expect(selectableIds(inventory, ["other-region", "bad-id"])).toEqual([]);
  });

  it("retains selected cells that remain UNKNOWN", () => {
    const next = reconcileTriageSelection(inventory, new Set(["z11", "b13", "a12"]));
    expect([...next]).toEqual(["z11", "b13"]);
  });

  it("drops previously selected cells that become saved", () => {
    const nextInventory: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "z11" ? { ...cell, state: "saved", cause: "present" } : cell),
    };
    const next = reconcileTriageSelection(nextInventory, new Set(["z11", "b13"]));
    expect([...next]).toEqual(["b13"]);
  });

  it("drops selections whose IDs were removed from a manifest", () => {
    const nextInventory: RegionInventory = { ...inventory, cells: inventory.cells.filter((cell) => cell.id !== "z11") };
    const next = reconcileTriageSelection(nextInventory, new Set(["z11", "b13"]));
    expect([...next]).toEqual(["b13"]);
  });

  it("returns no cells when nothing is selected", () => {
    const plan = selectedDownloadPlan(manifest, inventory, []);
    expect(plan.manifest.cells).toEqual([]);
    expect(plan.totalBytes).toBe(0);
    expect(plan.skipped).toEqual([]);
  });

  it("returns only eligible manifest entries", () => {
    const plan = selectedDownloadPlan(manifest, inventory, ["a12", "b13", "z11"]);
    expect(plan.ids).toEqual(["z11", "b13"]);
    expect(plan.manifest.cells.map((cell) => cell.id)).toEqual(["z11", "b13"]);
    expect(plan.totalBytes).toBe(800);
    expect(plan.skipped).toEqual(["a12"]);
  });

  it("retains provenance exactly for each selected cell", () => {
    const plan = selectedDownloadPlan(manifest, inventory, ["b13", "g18"]);
    expect(plan.manifest.cells[0]?.provenance).toEqual(third);
    expect(plan.manifest.cells[1]?.provenance).toEqual(second);
  });

  it("records unlisted IDs as skipped without inventing contents", () => {
    const plan = selectedDownloadPlan(manifest, inventory, ["invalid", "z11", "invalid"]);
    expect(plan.ids).toEqual(["z11"]);
    expect(plan.skipped).toEqual(["invalid"]);
  });

  it("keeps the region ID unchanged", () => {
    const plan = selectedDownloadPlan(manifest, inventory, ["z11"]);
    expect(plan.manifest.regionId).toBe("north");
  });

  it("rejects an inventory from another region", () => {
    expect(() => selectedDownloadPlan(manifest, { ...inventory, regionId: "south" }, ["z11"])).toThrow("Region mismatch");
  });

  it("rejects unsafe expected byte counts", () => {
    const altered: RegionManifest = {
      ...manifest,
      cells: manifest.cells.map((cell) => cell.id === "z11" ? { ...cell, bytes: -1 } : cell),
    };
    expect(() => selectedDownloadPlan(altered, inventory, ["z11"])).toThrow(RangeError);
  });

  it("rejects non-integer sizes", () => {
    const altered: RegionManifest = {
      ...manifest,
      cells: manifest.cells.map((cell) => cell.id === "z11" ? { ...cell, bytes: 1.25 } : cell),
    };
    expect(() => selectedDownloadPlan(altered, inventory, ["z11"])).toThrow(RangeError);
  });

  it("rejects sums exceeding the safe integer range", () => {
    const altered: RegionManifest = {
      ...manifest,
      cells: manifest.cells.map((cell) => cell.id === "z11" || cell.id === "b13" ?
        { ...cell, bytes: Number.MAX_SAFE_INTEGER } : cell),
    };
    expect(() => selectedDownloadPlan(altered, inventory, ["z11", "b13"])).toThrow(RangeError);
  });

  it("allows explicitly listed zero-length cells", () => {
    const plan = selectedDownloadPlan(manifest, inventory, ["e16"]);
    expect(plan.ids).toEqual(["e16"]);
    expect(plan.totalBytes).toBe(0);
  });
});

describe("triage counts and classifications", () => {
  it("counts every cause without collapsing UNKNOWN", () => {
    expect(triageCounts(inventory)).toEqual({
      total: 8, saved: 3, unknown: 5, missing: 2, stale: 2, unreadable: 1,
    });
  });

  it("keeps unreadable bytes UNKNOWN", () => {
    const unreadable = triagePage(inventory, query({ filter: "unreadable" }));
    expect(unreadable.matchedUnknown).toBe(1);
    expect(unreadable.cells[0]?.state).toBe("unknown");
  });

  it("reports cause groups in a stable order", () => {
    expect(triageCauseGroups(inventory).map((group) => group.cause)).toEqual([
      "missing", "stale", "unreadable", "present",
    ]);
  });

  it("reports bytes for each cause", () => {
    expect(triageCauseGroups(inventory).map((group) => group.bytes)).toEqual([500, 360, 800, 320]);
  });

  it("includes IDs for each cause", () => {
    expect(triageCauseGroups(inventory)[1]?.ids).toEqual(["b13", "g18"]);
  });

  it("handles an empty cause group without dividing by zero", () => {
    const empty: RegionInventory = { ...inventory, cells: [] };
    expect(triageCauseGroups(empty).every((group) => group.count === 0 && group.bytes === 0)).toBe(true);
  });

  it("accepts the documented filters only", () => {
    for (const name of ["all", "unknown", "saved", "missing", "stale", "unreadable"]) {
      expect(isTriageFilter(name)).toBe(true);
    }
    for (const name of ["accessible", "passed", "offline", "", "nearby"]) {
      expect(isTriageFilter(name)).toBe(false);
    }
  });

  it("accepts the documented orders only", () => {
    for (const name of ["manifest", "id", "largest", "smallest", "source", "date"]) {
      expect(isTriageOrder(name)).toBe(true);
    }
    for (const name of ["distance", "status", "popular", "", "rating"]) {
      expect(isTriageOrder(name)).toBe(false);
    }
  });
});
