import { describe, expect, it } from "vitest";
import type { Provenance, RegionManifest, StorageEstimate } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import {
  browseRecovery, DEFAULT_RECOVERY_LIMITS, planRecoveryBatches,
  recoveryEstimate, recoveryFingerprint, safeRecoveryId, safeRecoverySource,
  selectedRecoveryBatch, summarizeRecovery, type RecoveryLimits,
} from "./recoveryBatches";

const alpha: Provenance = { source: "Ontario public catalogue", licence: "CC BY 4.0", date: "2026-03-01" };
const beta: Provenance = { source: "Municipal catalogue", licence: "CC0 1.0", date: "2026-01-02" };
const dayThree: Provenance = { ...alpha, date: "2026-03-03" };
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "a", bytes: 10, provenance: alpha },
    { id: "b", bytes: 20, provenance: alpha },
    { id: "c", bytes: 30, provenance: beta },
    { id: "d", bytes: 40, provenance: beta },
    { id: "e", bytes: 50, provenance: dayThree },
  ],
};

function cell(id: string, cause: InventoryCell["cause"], state?: InventoryCell["state"]): InventoryCell {
  const expected = manifest.cells.find((item) => item.id === id);
  if (!expected) throw new Error(`Unknown test cell: ${id}`);
  return {
    id, expectedBytes: expected.bytes, provenance: expected.provenance,
    cause, state: state ?? (cause === "present" ? "saved" : "unknown"),
  };
}

function inventory(rows: readonly InventoryCell[] = [
  cell("a", "present"), cell("b", "missing"), cell("c", "stale"),
  cell("d", "unreadable"), cell("e", "missing"),
]): RegionInventory {
  const saved = rows.filter((row) => row.state === "saved");
  return {
    regionId: "north", cells: rows,
    savedCount: saved.length, unknownCount: rows.length - saved.length,
    savedBytes: saved.reduce((sum, row) => sum + row.expectedBytes, 0),
    expectedBytes: rows.reduce((sum, row) => sum + row.expectedBytes, 0),
    complete: saved.length === rows.length,
  };
}

const ample: StorageEstimate = { quota: 8_000_000, usage: 10_000 };
function plan(rows: RegionInventory | null = inventory(), estimate = ample, limits?: RecoveryLimits) {
  return planRecoveryBatches(manifest, rows, estimate, limits);
}

describe("offline recovery batch planner", () => {
  it("separates saved cells, candidates and cells that need inspection", () => {
    const result = plan();
    expect(result.state).toBe("ready");
    expect(result.rows.map((row) => row.offlineStatus)).toEqual([
      "saved", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN",
    ]);
    expect(result.eligibleIds).toEqual(["b", "c", "e"]);
    expect(result.blockedIds).toEqual(["d"]);
    expect(result.totalBytes).toBe(100);
    expect(result.suggestedBytes).toBe(100);
  });

  it("never grants a source tier based on a successful offline copy", () => {
    const result = plan();
    expect(result.rows.every((row) => row.tier === "UNKNOWN")).toBe(true);
    expect(result.batches.every((batch) => batch.tier === "UNKNOWN")).toBe(true);
  });

  it("keeps the unreadable cell UNKNOWN and outside download batches", () => {
    const result = plan();
    expect(result.rows.find((row) => row.id === "d")).toMatchObject({
      reason: "unreadable", action: "inspect", offlineStatus: "UNKNOWN",
    });
    expect(result.batches.flatMap((batch) => batch.ids)).not.toContain("d");
  });

  it("groups exactly matching source, licence and date triples", () => {
    const result = plan();
    expect(result.batches).toHaveLength(3);
    expect(result.batches.map((batch) => batch.ids)).toEqual([["b"], ["c"], ["e"]]);
    expect(result.batches.map((batch) => batch.source.date)).toEqual([
      "2026-03-01", "2026-01-02", "2026-03-03",
    ]);
  });

  it("preserves manifest order within a group", () => {
    const result = plan(inventory([
      cell("a", "missing"), cell("b", "missing"), cell("c", "present"),
      cell("d", "present"), cell("e", "present"),
    ]));
    expect(result.batches[0]?.ids).toEqual(["a", "b"]);
  });

  it("splits on the per-batch cell count", () => {
    const result = plan(inventory([
      cell("a", "missing"), cell("b", "missing"), cell("c", "present"),
      cell("d", "present"), cell("e", "present"),
    ]), ample, { ...DEFAULT_RECOVERY_LIMITS, maxCellsPerBatch: 1 });
    expect(result.batches.map((batch) => batch.ids)).toEqual([["a"], ["b"]]);
  });

  it("splits by total batch bytes without splitting a cell", () => {
    const result = plan(inventory([
      cell("a", "missing"), cell("b", "missing"), cell("c", "present"),
      cell("d", "present"), cell("e", "present"),
    ]), ample, { ...DEFAULT_RECOVERY_LIMITS, maxBytesPerBatch: 20 });
    expect(result.batches.map((batch) => batch.ids)).toEqual([["a"], ["b"]]);
  });

  it("blocks a single cell larger than the batch cap", () => {
    const result = plan(inventory(), ample, { ...DEFAULT_RECOVERY_LIMITS, maxBytesPerBatch: 15 });
    expect(result.batches.find((batch) => batch.ids.includes("b"))?.status).toBe("insufficient");
    expect(result.budget).toBe("insufficient");
  });

  it("preserves already saved cells without creating a retry", () => {
    const result = plan(inventory(manifest.cells.map((entry) => cell(entry.id, "present"))));
    expect(result.state).toBe("no-action");
    expect(result.eligibleIds).toEqual([]);
    expect(result.batches).toEqual([]);
    expect(result.budget).toBe("fits");
  });

  it("fails closed when the inventory is absent", () => {
    const result = plan(null);
    expect(result.state).toBe("UNKNOWN");
    expect(result.notes).toContain("inventory-unavailable");
    expect(result.eligibleIds).toEqual([]);
    expect(result.batches).toEqual([]);
    expect(result.rows.every((row) => row.offlineStatus === "UNKNOWN")).toBe(true);
  });

  it("fails closed when inventory belongs to another region", () => {
    const result = plan({ ...inventory(), regionId: "other" });
    expect(result.notes).toContain("region-mismatch");
    expect(result.state).toBe("UNKNOWN");
  });

  it("does not infer a missing cell from an incomplete inspection", () => {
    const result = plan(inventory([cell("a", "present")]));
    expect(result.notes).toContain("incomplete-inventory");
    expect(result.eligibleIds).toEqual([]);
  });

  it("fails closed when the manifest duplicates an identifier", () => {
    const invalid: RegionManifest = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] };
    const result = planRecoveryBatches(invalid, inventory(), ample);
    expect(result.notes).toContain("duplicate-manifest");
    expect(result.batches).toEqual([]);
  });

  it("fails closed when the inventory duplicates an identifier", () => {
    const result = plan(inventory([...inventory().cells, cell("a", "present")]));
    expect(result.notes).toContain("duplicate-inventory");
    expect(result.batches).toEqual([]);
  });

  it("fails closed when there is an unlisted cell", () => {
    const extra: InventoryCell = { ...cell("a", "present"), id: "unlisted" };
    const result = plan(inventory([...inventory().cells, extra]));
    expect(result.notes).toContain("unlisted-cell");
    expect(result.rows.at(-1)).toMatchObject({ id: "unlisted", offlineStatus: "UNKNOWN" });
  });

  it("blocks mismatching provenance rather than recommending a download", () => {
    const modified = inventory().cells.map((row) => row.id === "b" ?
      { ...row, provenance: beta } : row);
    const result = plan(inventory(modified));
    expect(result.rows.find((row) => row.id === "b")?.reason).toBe("metadata-conflict");
    expect(result.eligibleIds).not.toContain("b");
  });

  it("blocks a mismatch in the declared expected size", () => {
    const modified = inventory().cells.map((row) => row.id === "b" ?
      { ...row, expectedBytes: 1000 } : row);
    const result = plan(inventory(modified));
    expect(result.rows.find((row) => row.id === "b")?.action).toBe("inspect");
  });

  it("does not mistake an UNKNOWN-state present row for saved", () => {
    const modified = inventory().cells.map((row) => row.id === "a" ?
      { ...row, state: "unknown" as const } : row);
    const result = plan(inventory(modified));
    expect(result.rows[0]?.offlineStatus).toBe("UNKNOWN");
    expect(result.rows[0]?.action).toBe("inspect");
  });

  it("does not infer an accurate quota when the estimate is missing", () => {
    const result = plan(inventory(), {});
    expect(result.freeBytes).toBeNull();
    expect(result.budget).toBe("UNKNOWN");
    expect(result.batches.every((batch) => batch.status === "UNKNOWN")).toBe(true);
  });

  it("treats negative and reversed quota values as UNKNOWN", () => {
    for (const estimate of [
      { quota: 10, usage: 11 }, { quota: -1, usage: 0 },
      { quota: 10, usage: -1 }, { quota: Number.NaN, usage: 0 },
      { quota: Number.POSITIVE_INFINITY, usage: 1 },
    ]) {
      expect(recoveryEstimate(estimate)).toBeNull();
      expect(plan(inventory(), estimate).budget).toBe("UNKNOWN");
    }
  });

  it("rejects non-integral and unsafe browser estimates", () => {
    expect(recoveryEstimate({ quota: 1.1, usage: 0 })).toBeNull();
    expect(recoveryEstimate({ quota: Number.MAX_SAFE_INTEGER + 1, usage: 0 })).toBeNull();
  });

  it("deducts the reserve from the available capacity", () => {
    const result = plan(inventory(), { quota: 1_048_675, usage: 0 });
    expect(result.budget).toBe("insufficient");
    expect(result.freeBytes).toBe(1_048_675);
    expect(result.batches.some((batch) => batch.status === "insufficient")).toBe(true);
  });

  it("counts allocated batches against one shared budget", () => {
    const result = plan(inventory(), { quota: 1_048_650, usage: 0 });
    expect(result.batches[0]?.status).toBe("fits");
    expect(result.batches[1]?.status).toBe("fits");
    expect(result.batches[2]?.status).toBe("insufficient");
    expect(result.suggestedBytes).toBe(50);
  });

  it("does not select a batch if inventory changed after planning", () => {
    const result = plan();
    const changed = recoveryFingerprint(manifest, inventory([
      cell("a", "present"), cell("b", "present"), cell("c", "stale"),
      cell("d", "unreadable"), cell("e", "missing"),
    ]));
    expect(selectedRecoveryBatch(result, "batch-1", changed)).toEqual([]);
  });

  it("selects only explicitly planned batch identifiers", () => {
    const result = plan();
    expect(selectedRecoveryBatch(result, "batch-1", result.fingerprint)).toEqual(["b"]);
    expect(selectedRecoveryBatch(result, "batch-nope", result.fingerprint)).toEqual([]);
  });

  it("does not select a batch with UNKNOWN storage budget", () => {
    const result = plan(inventory(), {});
    expect(selectedRecoveryBatch(result, "batch-1", result.fingerprint)).toEqual([]);
  });

  it("rejects an invalid batch cell cap", () => {
    expect(() => plan(inventory(), ample, {
      ...DEFAULT_RECOVERY_LIMITS, maxCellsPerBatch: 0,
    })).toThrow();
  });

  it("rejects an unsafe batch byte cap", () => {
    expect(() => plan(inventory(), ample, {
      ...DEFAULT_RECOVERY_LIMITS, maxBytesPerBatch: Number.NaN,
    })).toThrow();
  });

  it("rejects an invalid reserved amount", () => {
    expect(() => plan(inventory(), ample, {
      ...DEFAULT_RECOVERY_LIMITS, reserveBytes: -1,
    })).toThrow();
  });

  it("reports exact summary counts without guessing unavailable bytes", () => {
    expect(summarizeRecovery(plan())).toMatchObject({
      saved: 1, missing: 2, stale: 1, unreadable: 1,
      unknown: 4, downloadable: 3, plannedBatches: 3,
    });
  });

  it("filters by action while preserving UNKNOWN for inspected cells", () => {
    const p = plan();
    const query = { search: "", order: "manifest" as const, start: 0, limit: 12 };
    expect(browseRecovery(p, { ...query, filter: "needs-download" }).rows.map((r) => r.id))
      .toEqual(["b", "c", "e"]);
    expect(browseRecovery(p, { ...query, filter: "inspect" }).rows.map((r) => r.id))
      .toEqual(["d"]);
    expect(browseRecovery(p, { ...query, filter: "saved" }).rows.map((r) => r.id))
      .toEqual(["a"]);
  });

  it("searches ID, source, licence and date without case sensitivity", () => {
    const p = plan();
    const query = { filter: "all" as const, order: "manifest" as const, start: 0, limit: 12 };
    expect(browseRecovery(p, { ...query, search: " B " }).rows.some((r) => r.id === "b")).toBe(true);
    expect(browseRecovery(p, { ...query, search: "municipal" }).rows.map((r) => r.id)).toEqual(["c", "d"]);
    expect(browseRecovery(p, { ...query, search: "CC0" }).total).toBe(2);
    expect(browseRecovery(p, { ...query, search: "2026-03-03" }).total).toBe(1);
  });

  it("paginates without silently dropping rows", () => {
    const p = plan();
    const seen: string[] = [];
    for (let start = 0; start < 5; start += 1) {
      const result = browseRecovery(p, {
        filter: "all", order: "manifest", search: "", start, limit: 1,
      });
      expect(result.rows).toHaveLength(1);
      const first = result.rows[0];
      if (!first) throw new Error("Missing expected page row");
      seen.push(first.id);
    }
    expect(seen).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("sorts by size and reason without mutating manifest order", () => {
    const p = plan();
    const query = { filter: "all" as const, search: "", start: 0, limit: 12 };
    expect(browseRecovery(p, { ...query, order: "bytes-asc" }).rows[0]?.id).toBe("a");
    expect(browseRecovery(p, { ...query, order: "bytes-desc" }).rows[0]?.id).toBe("e");
    expect(browseRecovery(p, { ...query, order: "reason" }).rows).toHaveLength(5);
    expect(manifest.cells.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("caps page size and rejects negative offsets", () => {
    const result = browseRecovery(plan(), {
      filter: "all", order: "id", search: "", start: -1, limit: 999,
    });
    expect(result.start).toBe(0);
    expect(result.limit).toBe(100);
  });

  it("accepts only safe, explicit cell identifiers", () => {
    for (const id of ["a", "A-13", "region:cell", "c_4"]) expect(safeRecoveryId(id)).toBe(true);
    for (const id of ["", "..", "../a", "a/b", " b", "a?b", "a".repeat(161)]) {
      expect(safeRecoveryId(id)).toBe(false);
    }
  });

  it("requires supported open licences and a calendar-valid source date", () => {
    expect(safeRecoverySource(alpha)).toBe(true);
    expect(safeRecoverySource({ ...alpha, licence: "Private" })).toBe(false);
    expect(safeRecoverySource({ ...alpha, source: "" })).toBe(false);
    expect(safeRecoverySource({ ...alpha, date: "2026-02-30" })).toBe(false);
    expect(safeRecoverySource({ ...alpha, date: "2024-02-29" })).toBe(true);
    expect(safeRecoverySource({ ...alpha, source: "Untrusted\nsource" })).toBe(false);
  });
});
