import { describe, expect, it } from "vitest";
import { inspectRegion } from "./regionInventory.ts";
import {
  capacityAction, DEFAULT_RESERVE_BYTES, formatBinaryBytes,
  planCapacity, summariseStorage,
} from "./quotaPlanning.ts";
import { type CellStore, type RegionManifest, type StoredCell } from "./regionDownload.ts";

const p = { source: "Public dataset", licence: "ODC-BY 1.0", date: "2026-10-20" };
const manifest: RegionManifest = {
  regionId: "example",
  cells: [
    { id: "one", bytes: 500_000, provenance: p },
    { id: "two", bytes: 1_000_000, provenance: p },
  ],
};

async function inventory(saved: readonly string[] = []) {
  const values = new Map<string, StoredCell>();
  for (const cell of manifest.cells) {
    if (saved.includes(cell.id)) {
      values.set(cell.id, { bytes: cell.bytes, provenance: p });
    }
  }
  const store: CellStore = {
    async get(_region, cell) { return values.get(cell); },
    async put(_region, cell, value) { values.set(cell, value); },
  };
  return inspectRegion(manifest, store);
}

describe("storage planning", () => {
  it("computes space for missing cells plus safety reserve", async () => {
    const plan = planCapacity(await inventory(["one"]), {
      quota: 5_000_000, usage: 2_000_000,
    });
    expect(plan.remainingBytes).toBe(1_000_000);
    expect(plan.requiredBytes).toBe(1_000_000 + DEFAULT_RESERVE_BYTES);
    expect(plan.status).toBe("sufficient");
    expect(plan.percentage).toBe(50);
    expect(capacityAction(plan)).toBe("download");
  });

  it("marks storage pressure without deleting saved files", async () => {
    const plan = planCapacity(await inventory(["one"]), {
      quota: 2_000_000, usage: 1_950_000,
    });
    expect(plan.status).toBe("low");
    expect(plan.missingCount).toBe(1);
    expect(capacityAction(plan)).toBe("review");
  });

  it("keeps unknown capacity UNKNOWN even when bytes are known", async () => {
    for (const estimate of [{}, { quota: 100 }, { usage: 10 }]) {
      const plan = planCapacity(await inventory(), estimate);
      expect(plan.status).toBe("unknown");
      expect(plan.freeBytes).toBeNull();
    }
  });

  it("handles impossible quota figures conservatively", () => {
    expect(summariseStorage({ quota: -1, usage: 0 }).freeBytes).toBeNull();
    expect(summariseStorage({ quota: Infinity, usage: 0 }).freeBytes).toBeNull();
    expect(summariseStorage({ quota: 100, usage: 200 }).freeBytes).toBe(0);
    expect(summariseStorage({ quota: NaN, usage: 0 }).freeBytes).toBeNull();
  });

  it("handles fully saved inventory without demanding more storage", async () => {
    const plan = planCapacity(await inventory(["one", "two"]), {});
    expect(plan.status).toBe("sufficient");
    expect(plan.missingCount).toBe(0);
    expect(plan.percentage).toBe(100);
    expect(capacityAction(plan)).toBe("complete");
  });

  it("rejects invalid reserve sizes", async () => {
    const current = await inventory();
    expect(() => planCapacity(current, {}, -1)).toThrow(RangeError);
    expect(() => planCapacity(current, {}, 1.5)).toThrow(RangeError);
  });

  it("formats binary sizes in both languages", () => {
    expect(formatBinaryBytes(0, "en")).toBe("0 B");
    expect(formatBinaryBytes(1024, "en")).toBe("1 KiB");
    expect(formatBinaryBytes(1536, "en")).toBe("1.5 KiB");
    expect(formatBinaryBytes(-1, "en")).toBe("UNKNOWN");
    expect(formatBinaryBytes(-1, "fr")).toBe("INCONNU");
    expect(formatBinaryBytes(1024, "fr")).toContain("KiB");
  });
});
