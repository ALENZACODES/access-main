import { describe, expect, it } from "vitest";
import type { RegionManifest, Provenance } from "./regionDownload";
import type { RegionInventory, InventoryCell } from "./regionInventory";
import {
  captureOfflineSnapshot, compareOfflineSnapshots, pageSnapshotComparison,
  type OfflineSnapshot,
} from "./sessionComparison";

const source: Provenance = { source: "Ontario data", licence: "CC BY 4.0", date: "2026-01-01" };
const other: Provenance = { source: "Municipal data", licence: "CC0 1.0", date: "2026-02-02" };
const manifest: RegionManifest = {
  regionId: "region-one",
  cells: [
    { id: "alpha", bytes: 1, provenance: source },
    { id: "beta", bytes: 2, provenance: source },
    { id: "gamma", bytes: 3, provenance: other },
  ],
};
const stamp = "2026-11-16T12:00:00.000Z";

function record(id: string, cause: InventoryCell["cause"]): InventoryCell {
  const cell = manifest.cells.find((item) => item.id === id);
  if (cell === undefined) throw new Error(`Unknown test fixture cell: ${id}`);
  return {
    id, cause, state: cause === "present" ? "saved" : "unknown",
    expectedBytes: cell.bytes, provenance: cell.provenance,
  };
}

function inventory(cells: InventoryCell[]): RegionInventory {
  const saved = cells.filter((cell) => cell.state === "saved");
  return {
    regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((sum, item) => sum + item.expectedBytes, 0),
    expectedBytes: cells.reduce((sum, item) => sum + item.expectedBytes, 0),
    complete: cells.length === saved.length,
  };
}

function full(causes: readonly InventoryCell["cause"][]): RegionInventory {
  const names = ["alpha", "beta", "gamma"];
  return inventory(causes.map((cause, i) => {
    const name = names[i];
    if (name === undefined) throw new Error("Bad fixture length");
    return record(name, cause);
  }));
}

function snapshot(causes: readonly InventoryCell["cause"][]): OfflineSnapshot {
  return captureOfflineSnapshot(manifest, full(causes), stamp);
}

describe("manual offline comparison metadata", () => {
  it("reports saved cells only for matching records", () => {
    const result = snapshot(["present", "present", "present"]);
    expect(result.state).toBe("complete");
    expect(result.notes).toEqual([]);
    expect(result.observations.map((item) => item.state)).toEqual(["saved", "saved", "saved"]);
  });

  it("retains UNKNOWN for missing, stale and unreadable cells", () => {
    const result = snapshot(["missing", "stale", "unreadable"]);
    expect(result.state).toBe("partial");
    expect(result.observations.map((item) => item.state)).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect(result.observations.map((item) => item.reason)).toEqual(["missing", "stale", "unreadable"]);
  });

  it("reports absent inventory as UNKNOWN", () => {
    const result = captureOfflineSnapshot(manifest, null, stamp);
    expect(result.state).toBe("UNKNOWN");
    expect(result.notes).toContain("inventory-unavailable");
    expect(result.observations.every((item) => item.state === "UNKNOWN")).toBe(true);
  });

  it("does not reuse cells from a different region", () => {
    const result = captureOfflineSnapshot(manifest, {
      ...full(["present", "present", "present"]), regionId: "other-region",
    }, stamp);
    expect(result.state).toBe("UNKNOWN");
    expect(result.notes).toContain("region-mismatch");
    expect(result.observations.every((item) => item.state === "UNKNOWN")).toBe(true);
  });

  it("rejects duplicate inventory IDs", () => {
    const result = captureOfflineSnapshot(manifest, inventory([
      record("alpha", "present"), record("alpha", "present"), record("beta", "present"),
    ]), stamp);
    expect(result.notes).toContain("duplicate-inventory");
    expect(result.state).toBe("UNKNOWN");
    expect(result.observations.every((item) => item.state === "UNKNOWN")).toBe(true);
  });

  it("does not count unlisted inventory as saved", () => {
    const extra = { ...record("alpha", "present"), id: "elsewhere" };
    const result = captureOfflineSnapshot(manifest, inventory([
      ...full(["present", "present", "present"]).cells, extra,
    ]), stamp);
    expect(result.state).toBe("UNKNOWN");
    expect(result.notes).toContain("unlisted-inventory");
  });

  it("rejects an invalid manifest instead of asserting success", () => {
    const invalid = { ...manifest, cells: [manifest.cells[0], manifest.cells[0]] };
    const result = captureOfflineSnapshot(invalid as RegionManifest, full(["present"]), stamp);
    expect(result.notes).toContain("invalid-manifest");
    expect(result.state).toBe("UNKNOWN");
  });

  it("rejects invalid source dates", () => {
    const invalid: RegionManifest = {
      ...manifest, cells: [{ id: "bad", bytes: 3, provenance: { ...source, date: "2026-02-30" } }],
    };
    expect(captureOfflineSnapshot(invalid, null, stamp).state).toBe("UNKNOWN");
  });

  it("does not elevate mismatched source metadata", () => {
    const bad = { ...record("alpha", "present"), provenance: other };
    const result = captureOfflineSnapshot(manifest, inventory([
      bad, record("beta", "present"), record("gamma", "present"),
    ]), stamp);
    expect(result.state).toBe("partial");
    expect(result.observations[0]?.state).toBe("UNKNOWN");
  });

  it("does not elevate mismatched byte counts", () => {
    const bad = { ...record("alpha", "present"), expectedBytes: 17 };
    const result = captureOfflineSnapshot(manifest, inventory([
      bad, record("beta", "present"), record("gamma", "present"),
    ]), stamp);
    expect(result.observations[0]?.state).toBe("UNKNOWN");
    expect(result.observations[0]?.reason).toBe("unreadable");
  });

  it("does not infer a saved cell from an absent observation", () => {
    const result = captureOfflineSnapshot(manifest, inventory([record("alpha", "present")]), stamp);
    expect(result.state).toBe("UNKNOWN");
    expect(result.notes).toContain("missing-observation");
    expect(result.observations[1]?.state).toBe("UNKNOWN");
  });

  it("counts newly saved copies with a stable manifest", () => {
    const before = snapshot(["missing", "stale", "present"]);
    const after = snapshot(["present", "present", "present"]);
    const result = compareOfflineSnapshots(before, after);
    expect(result.status).toBe("complete");
    expect(result.newlySaved).toBe(2);
    expect(result.unchangedSaved).toBe(1);
    expect(result.noLongerSaved).toBe(0);
    expect(result.cannotCompare).toBe(0);
  });

  it("counts a lost local copy without inventing a reason", () => {
    const result = compareOfflineSnapshots(
      snapshot(["present", "present", "present"]),
      snapshot(["missing", "present", "present"]),
    );
    expect(result.status).toBe("partial");
    expect(result.noLongerSaved).toBe(1);
    expect(result.unknown).toBe(1);
    expect(result.changes[0]?.change).toBe("no-longer-saved");
  });

  it("keeps UNKNOWN when missing becomes stale", () => {
    const result = compareOfflineSnapshots(
      snapshot(["missing", "present", "present"]),
      snapshot(["stale", "present", "present"]),
    );
    expect(result.changes[0]?.change).toBe("different-reason");
    expect(result.newlySaved).toBe(0);
    expect(result.unknown).toBe(1);
  });

  it("marks an unchanged unknown without making it available", () => {
    const result = compareOfflineSnapshots(
      snapshot(["missing", "present", "present"]),
      snapshot(["missing", "present", "present"]),
    );
    expect(result.changes[0]?.change).toBe("unchanged-unknown");
    expect(result.unknown).toBe(1);
  });

  it("fails closed when either reading is UNKNOWN", () => {
    const before = captureOfflineSnapshot(manifest, null, stamp);
    const after = snapshot(["present", "present", "present"]);
    const result = compareOfflineSnapshots(before, after);
    expect(result.status).toBe("UNKNOWN");
    expect(result.newlySaved).toBe(0);
    expect(result.cannotCompare).toBe(3);
  });

  it("fails closed when region IDs differ", () => {
    const before = snapshot(["present", "present", "present"]);
    const after = { ...before, regionId: "another-region" };
    const result = compareOfflineSnapshots(before, after);
    expect(result.status).toBe("UNKNOWN");
    expect(result.cannotCompare).toBe(3);
  });

  it("does not compare a changed source as identical", () => {
    const before = snapshot(["present", "present", "present"]);
    const after = {
      ...before,
      observations: before.observations.map((item) => item.cellId === "alpha" ?
        { ...item, source: other } : item),
    };
    const result = compareOfflineSnapshots(before, after);
    expect(result.status).toBe("UNKNOWN");
    expect(result.changes[0]?.change).toBe("changed-listing");
  });

  it("does not compare an added manifest cell as saved", () => {
    const before = snapshot(["present", "present", "present"]);
    const after = { ...before, observations: before.observations.slice(1) };
    const result = compareOfflineSnapshots(before, after);
    expect(result.status).toBe("UNKNOWN");
    expect(result.changes[0]?.change).toBe("observation-unavailable");
  });

  it("filters changes independently from saved cells", () => {
    const result = compareOfflineSnapshots(
      snapshot(["missing", "present", "present"]),
      snapshot(["present", "present", "missing"]),
    );
    const page = pageSnapshotComparison(result, { filter: "changed", search: "", offset: 0, limit: 12 });
    expect(page.rows.map((row) => row.cellId)).toEqual(["alpha", "gamma"]);
    expect(page.rows.map((row) => row.change)).toEqual(["newly-saved", "no-longer-saved"]);
  });

  it("filters UNKNOWN without making it saved", () => {
    const result = compareOfflineSnapshots(
      snapshot(["present", "present", "present"]),
      snapshot(["present", "stale", "unreadable"]),
    );
    const page = pageSnapshotComparison(result, { filter: "unknown", search: "", offset: 0, limit: 12 });
    expect(page.rows.map((row) => row.cellId)).toEqual(["beta", "gamma"]);
    expect(page.rows.every((row) => row.after?.state === "UNKNOWN")).toBe(true);
  });

  it("searches source, licence, date and IDs", () => {
    const result = compareOfflineSnapshots(
      snapshot(["present", "present", "present"]),
      snapshot(["present", "present", "present"]),
    );
    for (const text of ["gamma", "municipal", "CC0 1.0", "2026-02-02"]) {
      const page = pageSnapshotComparison(result, { filter: "all", search: text, offset: 0, limit: 12 });
      expect(page.rows.map((row) => row.cellId)).toEqual(["gamma"]);
    }
  });

  it("paginates deterministically and caps page size", () => {
    const result = compareOfflineSnapshots(
      snapshot(["present", "present", "present"]),
      snapshot(["present", "present", "present"]),
    );
    const first = pageSnapshotComparison(result, { filter: "all", search: "", offset: 0, limit: 1 });
    const second = pageSnapshotComparison(result, { filter: "all", search: "", offset: 1, limit: 1 });
    expect(first.rows.map((row) => row.cellId)).toEqual(["alpha"]);
    expect(second.rows.map((row) => row.cellId)).toEqual(["beta"]);
    expect(first.hasNext).toBe(true);
    expect(second.hasPrevious).toBe(true);
    expect(pageSnapshotComparison(result, { filter: "all", search: "", offset: -2, limit: 900 }).limit).toBe(100);
  });
});
