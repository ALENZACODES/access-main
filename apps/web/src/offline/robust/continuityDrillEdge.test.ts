import { describe, expect, it } from "vitest";
import type { Provenance, RegionManifest } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import { drillSourceSummary, pageContinuityDrill, runContinuityDrill,
  type DrillSettings } from "./continuityDrill";

const open: Provenance = { source: "Local open records", licence: "CC0 1.0", date: "2026-09-09" };
const other: Provenance = { source: "Other open records", licence: "CC BY 4.0", date: "2023-01-01" };
const cell = (id: string, bytes: number, source = open) => ({ id, bytes, provenance: source });
const stored = (id: string, bytes: number, source = open): InventoryCell => ({
  id, expectedBytes: bytes, provenance: source, state: "saved", cause: "present",
});
const listed = (cells: RegionManifest["cells"]): RegionManifest => ({ regionId: "sample", cells });
function read(cells: readonly InventoryCell[]): RegionInventory {
  return {
    regionId: "sample", cells,
    savedCount: cells.filter((item) => item.state === "saved").length,
    unknownCount: cells.filter((item) => item.state === "unknown").length,
    savedBytes: cells.filter((item) => item.state === "saved")
      .reduce((total, item) => total + item.expectedBytes, 0),
    expectedBytes: cells.reduce((total, item) => total + item.expectedBytes, 0),
    complete: cells.every((item) => item.state === "saved"),
  };
}
function config(scenario: DrillSettings["scenario"], affectedCount = 1,
  reductionBytes = 0, preserveReserveBytes = 0): DrillSettings {
  return { scenario, affectedCount, reductionBytes, preserveReserveBytes };
}

describe("continuity boundary and provenance regression", () => {
  it("accepts an empty manifest as an empty baseline", () => {
    const outcome = runContinuityDrill(listed([]), read([]));
    expect(outcome.cells).toEqual([]);
    expect(outcome.totals.listed).toBe(0);
  });
  it("keeps a single saved cell complete", () => {
    const outcome = runContinuityDrill(listed([cell("one", 1)]), read([stored("one", 1)]));
    expect(outcome.status).toBe("complete");
  });
  it("converts a single simulated loss to UNKNOWN", () => {
    const outcome = runContinuityDrill(listed([cell("one", 1)]), read([stored("one", 1)]), config("evict-largest"));
    expect(outcome.cells[0]?.after).toBe("UNKNOWN");
    expect(outcome.status).toBe("partial");
  });
  it("preserves original status after a simulated loss", () => {
    const outcome = runContinuityDrill(listed([cell("one", 1)]), read([stored("one", 1)]), config("evict-largest"));
    expect(outcome.cells[0]?.before).toBe("saved");
  });
  it("handles a zero-byte saved cell deterministically", () => {
    const outcome = runContinuityDrill(listed([cell("zero", 0)]), read([stored("zero", 0)]), config("evict-largest"));
    expect(outcome.cells[0]?.affected).toBe(true);
    expect(outcome.totals.hypotheticalLossBytes).toBe(0);
  });
  it("keeps the original cause with a simulated change", () => {
    const outcome = runContinuityDrill(listed([cell("one", 1)]), read([stored("one", 1)]), config("source-change"));
    expect(outcome.cells[0]?.cause).toBe("present");
    expect(outcome.cells[0]?.reason).toBe("simulated-source-change");
  });
  it("distinguishes a mismatching saved byte count from a matching copy", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 9)]));
    expect(outcome.cells[0]?.reason).toBe("inventory-conflict");
    expect(outcome.cells[0]?.after).toBe("UNKNOWN");
  });
  it("distinguishes different source names", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 10, other)]));
    expect(outcome.cells[0]?.reason).toBe("inventory-conflict");
  });
  it("distinguishes different source dates", () => {
    const changed: Provenance = { ...open, date: "2025-01-01" };
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 10, changed)]));
    expect(outcome.cells[0]?.after).toBe("UNKNOWN");
  });
  it("does not treat present cause with unknown state as saved", () => {
    const value: InventoryCell = { ...stored("one", 10), state: "unknown" };
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([value]));
    expect(outcome.cells[0]?.after).toBe("UNKNOWN");
  });
  it("does not infer a missing cell from an absent observation", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([]));
    expect(outcome.cells[0]?.cause).toBe("unreadable");
  });
  it("reports missing when the cause is explicitly missing", () => {
    const value: InventoryCell = { ...stored("one", 10), state: "unknown", cause: "missing" };
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([value]));
    expect(outcome.cells[0]?.cause).toBe("missing");
  });
  it("reports stale when the cause is explicitly stale", () => {
    const value: InventoryCell = { ...stored("one", 10), state: "unknown", cause: "stale" };
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([value]));
    expect(outcome.cells[0]?.cause).toBe("stale");
  });
  it("does not include unreadable copies in simulated eviction candidates", () => {
    const value: InventoryCell = { ...stored("one", 10), state: "unknown", cause: "unreadable" };
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([value]), config("evict-largest"));
    expect(outcome.totals.affected).toBe(0);
  });
  it("keeps a zero capacity estimate separate from accessibility status", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 10)]),
      config("baseline"), { quota: 0, usage: 0 });
    expect(outcome.quota.freeBytes).toBe(0);
    expect(outcome.status).toBe("complete");
  });
  it("never treats an invalid quota as a positive estimate", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), read([stored("one", 10)]),
      config("quota-reduction"), { quota: Number.NaN, usage: 0 });
    expect(outcome.status).toBe("UNKNOWN");
  });
  it("does not invent a source for a missing inventory", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10)]), null);
    expect(outcome.cells[0]?.after).toBe("UNKNOWN");
    expect(outcome.totals.afterSavedBytes).toBeNull();
  });
  it("tracks distinct licence groups separately", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10, open), cell("two", 10, other)]),
      read([stored("one", 10, open), stored("two", 10, other)]));
    expect(drillSourceSummary(outcome)).toHaveLength(2);
  });
  it("keeps source grouping deterministic across repeated calls", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10, open), cell("two", 10, other)]),
      read([stored("one", 10, open), stored("two", 10, other)]));
    expect(drillSourceSummary(outcome)).toEqual(drillSourceSummary(outcome));
  });
  it("does not present an overflowing byte count as available", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const outcome = runContinuityDrill(listed([cell("one", huge), cell("two", huge)]),
      read([stored("one", huge), stored("two", huge)]));
    expect(outcome.totals.listedBytes).toBeNull();
  });
  it("does not alter source grouping after pagination", () => {
    const outcome = runContinuityDrill(listed([cell("one", 10), cell("two", 10)]),
      read([stored("one", 10), stored("two", 10)]));
    const before = drillSourceSummary(outcome);
    pageContinuityDrill(outcome, { search: "", filter: "all", sort: "bytes-desc", offset: 0, limit: 1 });
    expect(drillSourceSummary(outcome)).toEqual(before);
  });
});

describe("continuity simulation under uneven local evidence", () => {
  const scenario = config("evict-largest", 2);
  const records = [cell("a", 120), cell("b", 80), cell("c", 60), cell("d", 40), cell("e", 20)];
  const copies = records.map((record) => stored(record.id, record.bytes));
  const baseline = runContinuityDrill(listed(records), read(copies), scenario);

  it("removes the two highest-size copies in the simulated state", () => {
    expect(baseline.cells.filter((item) => item.affected).map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("preserves all five before states when all records match", () => {
    expect(baseline.cells.every((item) => item.before === "saved")).toBe(true);
  });
  it("does not classify any affected simulated copy as saved", () => {
    expect(baseline.cells.filter((item) => item.affected).every((item) => item.after === "UNKNOWN")).toBe(true);
  });
  it("keeps the other saved copies as saved", () => {
    expect(baseline.cells.filter((item) => !item.affected).every((item) => item.after === "saved")).toBe(true);
  });
  it("computes the hypothetical loss in listed bytes", () => {
    expect(baseline.totals.hypotheticalLossBytes).toBe(200);
  });
  it("computes remaining listed bytes without confusing them with capacity", () => {
    expect(baseline.totals.afterSavedBytes).toBe(120);
  });
  it("preserves the original five listed entries", () => {
    expect(baseline.totals.listed).toBe(5);
  });
  it("does not mutate the original records array", () => {
    expect(records.map((item) => item.bytes)).toEqual([120, 80, 60, 40, 20]);
  });
  it("does not mutate the original copy entries", () => {
    expect(copies.every((item) => item.state === "saved")).toBe(true);
  });
  it("allows filtering to after-drill UNKNOWN cells", () => {
    const page = pageContinuityDrill(baseline, {
      search: "", filter: "UNKNOWN", sort: "listed", offset: 0, limit: 12,
    });
    expect(page.rows.map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("allows filtering to after-drill saved copies", () => {
    const page = pageContinuityDrill(baseline, {
      search: "", filter: "saved", sort: "listed", offset: 0, limit: 12,
    });
    expect(page.rows.map((item) => item.id)).toEqual(["c", "d", "e"]);
  });
  it("sorts affected entries deterministically by descending size", () => {
    const page = pageContinuityDrill(baseline, {
      search: "", filter: "affected", sort: "bytes-desc", offset: 0, limit: 12,
    });
    expect(page.rows.map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("does not treat whitespace as a cell identifier", () => {
    const page = pageContinuityDrill(baseline, {
      search: "   ", filter: "all", sort: "listed", offset: 0, limit: 12,
    });
    expect(page.total).toBe(5);
  });
  it("limits a page to the requested number of cells", () => {
    const page = pageContinuityDrill(baseline, {
      search: "", filter: "all", sort: "listed", offset: 0, limit: 2,
    });
    expect(page.rows).toHaveLength(2);
    expect(page.next).toBe(true);
  });
  it("ends pagination precisely at the final page", () => {
    const page = pageContinuityDrill(baseline, {
      search: "", filter: "all", sort: "listed", offset: 4, limit: 2,
    });
    expect(page.rows).toHaveLength(1);
    expect(page.next).toBe(false);
  });
  it("keeps listed IDs in their original order after unrelated sorting", () => {
    pageContinuityDrill(baseline, { search: "", filter: "all", sort: "bytes-desc", offset: 0, limit: 5 });
    const page = pageContinuityDrill(baseline, {
      search: "", filter: "all", sort: "listed", offset: 0, limit: 5,
    });
    expect(page.rows.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("preserves unknown capacity when the caller provides no estimate", () => {
    expect(baseline.quota.freeBytes).toBeNull();
  });
  it("marks the simulated effects separately from original causes", () => {
    const affected = baseline.cells.filter((item) => item.affected);
    expect(affected.every((item) => item.cause === "present")).toBe(true);
    expect(affected.every((item) => item.reason === "simulated-eviction")).toBe(true);
  });
  it("keeps each cell source when a simulation affects the cell", () => {
    const affected = baseline.cells.filter((item) => item.affected);
    expect(affected.every((item) => item.provenance?.licence === "CC0 1.0")).toBe(true);
  });
  it("does not infer accessibility from source publication dates", () => {
    expect(baseline.cells.every((item) => !Object.keys(item).includes("accessibility"))).toBe(true);
  });
  it("returns UNKNOWN for a local record whose source was replaced", () => {
    const altered = [...copies];
    altered[1] = stored("b", 80, other);
    const outcome = runContinuityDrill(listed(records), read(altered), scenario);
    expect(outcome.cells.find((item) => item.id === "b")?.before).toBe("UNKNOWN");
    expect(outcome.cells.find((item) => item.id === "b")?.affected).toBe(false);
  });
  it("does not mark an explicitly missing local copy as simulated loss", () => {
    const altered = copies.map((item) => item.id === "a" ?
      { ...item, state: "unknown" as const, cause: "missing" as const } : item);
    const outcome = runContinuityDrill(listed(records), read(altered), scenario);
    expect(outcome.cells.find((item) => item.id === "a")?.affected).toBe(false);
    expect(outcome.cells.find((item) => item.id === "a")?.before).toBe("UNKNOWN");
  });
  it("does not calculate a simulated loss from stale copies", () => {
    const altered = copies.map((item) => item.id === "a" ?
      { ...item, state: "unknown" as const, cause: "stale" as const } : item);
    const outcome = runContinuityDrill(listed(records), read(altered), scenario);
    expect(outcome.cells.find((item) => item.id === "a")?.affected).toBe(false);
  });
  it("retains nonnegative counts under quota-reduction simulation", () => {
    const outcome = runContinuityDrill(listed(records), read(copies),
      config("quota-reduction", 0, 5_000, 20), { quota: 100, usage: 90 });
    expect(outcome.totals.afterUnknown).toBeGreaterThanOrEqual(0);
    expect(outcome.totals.afterSaved).toBeGreaterThanOrEqual(0);
  });
  it("never reports more newly unknown cells than initially saved copies", () => {
    const outcome = runContinuityDrill(listed(records), read(copies),
      config("quota-reduction", 0, 5_000, 20), { quota: 100, usage: 90 });
    expect(outcome.totals.affected).toBeLessThanOrEqual(outcome.totals.beforeSaved);
  });
  it("keeps reduced-capacity simulations distinct from actual deletion", () => {
    const outcome = runContinuityDrill(listed(records), read(copies),
      config("quota-reduction", 0, 5_000, 20), { quota: 100, usage: 90 });
    expect(outcome.cells.filter((item) => item.affected)
      .every((item) => item.reason === "simulated-capacity")).toBe(true);
  });
});
