import { describe, expect, it } from "vitest";
import {
  browseStorageScenario, DEFAULT_SCENARIO_OPTIONS,
  planStorageScenario, scenarioSources, type ScenarioInput,
} from "./storageScenario.ts";
import type { RegionManifest, Provenance } from "./regionDownload.ts";
import type { InventoryCell, RegionInventory } from "./regionInventory.ts";

const sourceA: Provenance = {
  source: "Municipal open data", licence: "CC BY 4.0", date: "2026-01-01",
};
const sourceB: Provenance = {
  source: "Regional open data", licence: "CC0 1.0", date: "2026-02-03",
};
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "alpha", bytes: 10, provenance: sourceA },
    { id: "beta", bytes: 20, provenance: sourceA },
    { id: "gamma", bytes: 30, provenance: sourceB },
    { id: "delta", bytes: 40, provenance: sourceB },
    { id: "epsilon", bytes: 50, provenance: sourceA },
  ],
};
function observed(id: string, cause: InventoryCell["cause"], source?: Provenance): InventoryCell {
  const expected = manifest.cells.find((cell) => cell.id === id);
  if (!expected) throw new Error(`Test cell not listed: ${id}`);
  return {
    id, expectedBytes: expected.bytes, provenance: source ?? expected.provenance,
    state: cause === "present" ? "saved" : "unknown", cause,
  };
}
const observations: readonly InventoryCell[] = [
  observed("alpha", "present"), observed("beta", "missing"),
  observed("gamma", "stale"), observed("delta", "unreadable"),
  observed("epsilon", "missing"),
];
function inventory(rows: readonly InventoryCell[] = observations): RegionInventory {
  const saved = rows.filter((cell) => cell.state === "saved" && cell.cause === "present");
  return {
    regionId: "north", cells: rows,
    savedCount: saved.length, unknownCount: rows.length - saved.length,
    savedBytes: saved.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    expectedBytes: rows.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    complete: rows.length === manifest.cells.length && saved.length === rows.length,
  };
}
function input(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    manifest, inventory: inventory(),
    estimate: { quota: 10_000_000, usage: 0 },
    reserveBytes: DEFAULT_SCENARIO_OPTIONS.reserveBytes,
    overheadBytes: 10, maxBatchCells: 2,
    ...overrides,
  };
}
const plan = () => planStorageScenario(input());

describe("offline storage planning", () => {
  it("does not mark an unreadable local record as saved", () => {
    const result = plan();
    expect(result.cells.map((cell) => cell.disposition)).toEqual([
      "saved", "candidate", "candidate", "UNKNOWN", "candidate",
    ]);
    expect(result.totals.savedCells).toBe(1);
    expect(result.totals.unknownCells).toBe(1);
    expect(result.status).toBe("UNKNOWN");
  });

  it("does not suggest unreadable cells", () => {
    expect(plan().suggestedIds).toEqual(["beta", "gamma", "epsilon"]);
    expect(plan().suggestedIds).not.toContain("delta");
  });

  it("accounts for overhead independently on every proposed cell", () => {
    const result = plan();
    expect(result.totals.candidateBytes).toBe(100);
    expect(result.totals.totalPlannedBytes).toBe(130);
  });

  it("subtracts reserve margin before grouping", () => {
    const result = planStorageScenario(input({
      estimate: { quota: 1_048_650, usage: 0 },
    }));
    expect(result.batches.some((batch) => batch.status === "insufficient")).toBe(true);
    expect(result.totals.freeBytes).toBe(1_048_650);
  });

  it("does not turn a positive estimate into a stored cell", () => {
    const result = planStorageScenario(input({
      inventory: inventory([
        observed("alpha", "present"), observed("beta", "missing"),
        observed("gamma", "present"), observed("delta", "present"),
        observed("epsilon", "present"),
      ]),
    }));
    expect(result.status).toBe("possible");
    expect(result.cells.find((cell) => cell.id === "beta")?.disposition).toBe("candidate");
  });

  it("does not assume a missing capacity estimate", () => {
    const result = planStorageScenario(input({ estimate: {} }));
    expect(result.status).toBe("UNKNOWN");
    expect(result.totals.freeBytes).toBeNull();
    expect(result.batches.every((batch) => batch.status === "UNKNOWN")).toBe(true);
  });

  it("rejects nonsensical quota estimates", () => {
    const estimates = [
      { quota: -1, usage: 0 },
      { quota: 100, usage: -1 },
      { quota: 100, usage: 101 },
      { quota: 10.5, usage: 0 },
      { quota: Number.NaN, usage: 0 },
      { quota: Number.MAX_SAFE_INTEGER + 1, usage: 0 },
    ];
    for (const estimate of estimates) {
      expect(planStorageScenario(input({ estimate })).totals.freeBytes).toBeNull();
    }
  });

  it("protects the exact boundary of a storage reserve", () => {
    const rows = [observed("alpha", "present"), observed("beta", "missing"),
      observed("gamma", "present"), observed("delta", "present"),
      observed("epsilon", "present")];
    const exact = planStorageScenario(input({
      inventory: inventory(rows), estimate: { quota: 1_048_606, usage: 0 },
    }));
    expect(exact.status).toBe("possible");
    const short = planStorageScenario(input({
      inventory: inventory(rows), estimate: { quota: 1_048_605, usage: 0 },
    }));
    expect(short.status).toBe("insufficient");
  });

  it("rejects unsupported licences", () => {
    const bad: RegionManifest = {
      ...manifest, cells: manifest.cells.map((cell) => ({
        ...cell, provenance: { ...cell.provenance, licence: "Proprietary" },
      })),
    };
    const result = planStorageScenario(input({ manifest: bad }));
    expect(result.blocks).toContain("manifest-invalid");
    expect(result.suggestedIds).toEqual([]);
  });

  it("does not accept a calendar date that cannot occur", () => {
    const bad = { ...manifest, cells: [{
      id: "alpha", bytes: 10, provenance: { ...sourceA, date: "2026-02-30" },
    }] };
    expect(planStorageScenario(input({ manifest: bad })).status).toBe("UNKNOWN");
  });

  it("distinguishes source dates in batch grouping", () => {
    const altered = {
      ...manifest,
      cells: manifest.cells.map((cell) => cell.id === "epsilon" ? {
        ...cell, provenance: { ...cell.provenance, date: "2026-01-02" },
      } : cell),
    };
    const rows = observations.map((row) => row.id === "epsilon" ? {
      ...row, provenance: { ...row.provenance, date: "2026-01-02" },
    } : row);
    const result = planStorageScenario(input({ manifest: altered, inventory: inventory(rows) }));
    expect(result.batches).toHaveLength(3);
    expect(result.batches.map((batch) => batch.ids)).toEqual([["beta"], ["gamma"], ["epsilon"]]);
  });

  it("groups by exact licence and source, not just source name", () => {
    const result = plan();
    expect(result.batches.map((batch) => batch.ids)).toEqual([["beta", "epsilon"], ["gamma"]]);
    expect(result.batches[0]?.source.licence).toBe("CC BY 4.0");
    expect(result.batches[1]?.source.licence).toBe("CC0 1.0");
  });

  it("caps the number of items in a batch", () => {
    const result = planStorageScenario(input({ maxBatchCells: 1 }));
    expect(result.batches).toHaveLength(3);
    expect(result.batches.every((batch) => batch.ids.length === 1)).toBe(true);
  });

  it("does not allow a zero batch size", () => {
    const result = planStorageScenario(input({ maxBatchCells: 0 }));
    expect(result.blocks).toContain("manifest-invalid");
    expect(result.batches).toEqual([]);
  });

  it("does not allow a fractional reserve or overhead", () => {
    for (const overrides of [{ reserveBytes: 1.5 }, { overheadBytes: -1 }]) {
      const result = planStorageScenario(input(overrides));
      expect(result.batches).toEqual([]);
      expect(result.status).toBe("UNKNOWN");
    }
  });

  it("fails closed on missing local inventory", () => {
    const result = planStorageScenario(input({ inventory: null }));
    expect(result.blocks).toContain("inventory-unavailable");
    expect(result.suggestedIds).toEqual([]);
    expect(result.cells.every((cell) => cell.disposition === "UNKNOWN")).toBe(true);
  });

  it("fails closed on inventory for another region", () => {
    const result = planStorageScenario(input({ inventory: { ...inventory(), regionId: "east" } }));
    expect(result.blocks).toContain("inventory-region-mismatch");
  });

  it("fails closed on duplicate observations", () => {
    const rows = [...observations, observed("beta", "missing")];
    const result = planStorageScenario(input({ inventory: inventory(rows) }));
    expect(result.blocks).toContain("duplicate-inventory");
    expect(result.batches).toEqual([]);
  });

  it("fails closed on unlisted observations", () => {
    const extra = { ...observed("alpha", "present"), id: "outside" };
    const result = planStorageScenario(input({ inventory: inventory([...observations, extra]) }));
    expect(result.blocks).toContain("unlisted-inventory");
  });

  it("fails closed on mismatched aggregate counts", () => {
    const result = planStorageScenario(input({ inventory: {
      ...inventory(), savedCount: 99,
    } }));
    expect(result.blocks).toContain("inventory-inconsistent");
  });

  it("does not infer a current copy from changed provenance", () => {
    const changed = observations.map((row) => row.id === "alpha" ? {
      ...row, provenance: sourceB,
    } : row);
    const result = planStorageScenario(input({ inventory: inventory(changed) }));
    expect(result.cells[0]?.disposition).toBe("UNKNOWN");
    expect(result.cells[0]?.reason).toBe("metadata-conflict");
  });

  it("treats absence from a partial inventory as UNKNOWN", () => {
    const rows = observations.filter((row) => row.id !== "epsilon");
    const result = planStorageScenario(input({ inventory: inventory(rows) }));
    expect(result.cells.find((cell) => cell.id === "epsilon")?.reason).toBe("not-inspected");
    expect(result.suggestedIds).not.toContain("epsilon");
  });

  it("fails closed on an invalid manifest region ID", () => {
    const result = planStorageScenario(input({ manifest: { ...manifest, regionId: "../bad" } }));
    expect(result.blocks).toContain("manifest-invalid");
  });

  it("rejects duplicate manifest cell IDs", () => {
    const result = planStorageScenario(input({ manifest: { ...manifest,
      cells: [manifest.cells[0]!, manifest.cells[0]!],
    } }));
    expect(result.blocks).toContain("manifest-invalid");
  });

  it("does not allow integer-overflow planned byte estimates", () => {
    const huge = { ...manifest, cells: [{
      id: "huge", bytes: Number.MAX_SAFE_INTEGER, provenance: sourceA,
    }] };
    const single = inventory([{
      id: "huge", expectedBytes: Number.MAX_SAFE_INTEGER, state: "unknown",
      cause: "missing", provenance: sourceA,
    }]);
    const result = planStorageScenario(input({ manifest: huge, inventory: single }));
    expect(result.status).toBe("UNKNOWN");
    expect(result.suggestedIds).toEqual([]);
  });

  it("filters candidate cells without changing the original plan", () => {
    const result = plan();
    const page = browseStorageScenario(result, {
      filter: "candidate", sort: "listed", search: "", offset: 0, limit: 10,
    });
    expect(page.cells.map((cell) => cell.id)).toEqual(["beta", "gamma", "epsilon"]);
    expect(result.cells).toHaveLength(5);
  });

  it("searches source names, licences and dates", () => {
    const result = plan();
    for (const search of ["Regional", "CC0", "2026-02-03"]) {
      const page = browseStorageScenario(result, {
        filter: "all", sort: "listed", search, offset: 0, limit: 10,
      });
      expect(page.cells.map((cell) => cell.id)).toEqual(["gamma", "delta"]);
    }
  });

  it("paginates without dropping cell IDs", () => {
    const result = plan();
    const seen: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const page = browseStorageScenario(result, {
        filter: "all", sort: "listed", search: "", offset: index, limit: 1,
      });
      const row = page.cells[0];
      if (!row) throw new Error("Expected cell row");
      seen.push(row.id);
      expect(page.hasPrevious).toBe(index > 0);
      expect(page.hasNext).toBe(index < 4);
    }
    expect(seen).toEqual(manifest.cells.map((cell) => cell.id));
  });

  it("enforces a bounded page size", () => {
    const page = browseStorageScenario(plan(), {
      filter: "all", sort: "listed", search: "", offset: -10, limit: 99_999,
    });
    expect(page.offset).toBe(0);
    expect(page.total).toBe(5);
  });

  it("keeps sorting stable across repeated reads", () => {
    const result = plan();
    for (const sort of ["id", "largest", "smallest", "reason"] as const) {
      const query = { filter: "all" as const, sort, search: "", offset: 0, limit: 20 };
      expect(browseStorageScenario(result, query)).toEqual(browseStorageScenario(result, query));
    }
  });

  it("groups exact source metadata without inventing a tier", () => {
    const groups = scenarioSources(plan());
    expect(groups).toHaveLength(2);
    expect(groups[0]?.source.date).toBe("2026-01-01");
    expect(groups[1]?.source.licence).toBe("CC0 1.0");
    expect(groups[0]?.candidates).toBe(2);
  });

  it("never mutates input observations or the manifest", () => {
    const originalManifest = JSON.stringify(manifest);
    const originalInventory = JSON.stringify(inventory());
    plan();
    expect(JSON.stringify(manifest)).toBe(originalManifest);
    expect(JSON.stringify(inventory())).toBe(originalInventory);
  });
});
