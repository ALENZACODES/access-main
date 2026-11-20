import { describe, expect, it } from "vitest";
import type { Provenance, RegionManifest, StorageEstimate } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import { DEFAULT_DRILL_SETTINGS, MAX_DRILL_AFFECTED, MAX_DRILL_CELLS,
  MAX_DRILL_PAGE, drillSourceSummary, pageContinuityDrill, runContinuityDrill,
  type DrillScenario, type DrillSettings } from "./continuityDrill";

const alpha: Provenance = { source: "City open records", licence: "CC BY 4.0", date: "2024-01-10" };
const beta: Provenance = { source: "Municipal records", licence: "CC0 1.0", date: "2025-04-02" };
const gamma: Provenance = { source: "Provincial information", licence: "Open Government Licence – Ontario", date: "2026-05-03" };
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "a", bytes: 10, provenance: alpha },
    { id: "b", bytes: 20, provenance: alpha },
    { id: "c", bytes: 50, provenance: beta },
    { id: "d", bytes: 80, provenance: gamma },
    { id: "e", bytes: 0, provenance: gamma },
  ],
};
function row(id: string, cause: InventoryCell["cause"] = "present", provenance?: Provenance): InventoryCell {
  const cell = manifest.cells.find((item) => item.id === id);
  if (!cell) throw new Error("Unknown fixture cell");
  return {
    id, expectedBytes: cell.bytes, cause,
    provenance: provenance ?? cell.provenance, state: cause === "present" ? "saved" : "unknown",
  };
}
function inventory(rows: readonly InventoryCell[]): RegionInventory {
  return {
    regionId: "north", cells: rows,
    savedCount: rows.filter((item) => item.state === "saved").length,
    unknownCount: rows.filter((item) => item.state !== "saved").length,
    savedBytes: rows.filter((item) => item.state === "saved")
      .reduce((sum, item) => sum + item.expectedBytes, 0),
    expectedBytes: rows.reduce((sum, item) => sum + item.expectedBytes, 0),
    complete: rows.every((item) => item.state === "saved"),
  };
}
const all = inventory(["a", "b", "c", "d", "e"].map((id) => row(id)));
const mixed = inventory([row("a"), row("b", "missing"), row("c", "stale"),
  row("d", "unreadable"), row("e")]);
const capacity: StorageEstimate = { quota: 5_000_000, usage: 1_000_000 };
function settings(scenario: DrillScenario = "baseline", overrides: Partial<DrillSettings> = {}): DrillSettings {
  return { ...DEFAULT_DRILL_SETTINGS, scenario, ...overrides };
}
function drill(scenario: DrillScenario = "baseline", source: RegionInventory | null = all,
  overrides: Partial<DrillSettings> = {}, estimate: StorageEstimate = capacity) {
  return runContinuityDrill(manifest, source, settings(scenario, overrides), estimate);
}

describe("offline continuity drill safety", () => {
  it("never changes the original manifest", () => {
    const before = JSON.stringify(manifest);
    drill("evict-largest");
    expect(JSON.stringify(manifest)).toBe(before);
  });
  it("never changes the original inventory", () => {
    const before = JSON.stringify(all);
    drill("evict-oldest");
    expect(JSON.stringify(all)).toBe(before);
  });
  it("preserves the schema of a local drill", () => {
    expect(drill().schema).toBe("offline-continuity-drill-v1");
  });
  it("retains the region identifier", () => {
    expect(drill().regionId).toBe("north");
  });
  it("does not simulate a copy as saved when it is missing", () => {
    const outcome = drill("baseline", mixed);
    expect(outcome.cells.find((cell) => cell.id === "b")?.after).toBe("UNKNOWN");
  });
  it("does not simulate a copy as saved when it is stale", () => {
    const outcome = drill("baseline", mixed);
    expect(outcome.cells.find((cell) => cell.id === "c")?.after).toBe("UNKNOWN");
  });
  it("does not simulate a copy as saved when it is unreadable", () => {
    const outcome = drill("baseline", mixed);
    expect(outcome.cells.find((cell) => cell.id === "d")?.after).toBe("UNKNOWN");
  });
  it("never infers source evidence tier", () => {
    const outcome = drill();
    expect(outcome.cells.every((cell) => cell.provenance === null || cell.provenance.source.length > 0)).toBe(true);
  });
  it("keeps baseline complete only with every matching local record", () => {
    expect(drill().status).toBe("complete");
    expect(drill("baseline", mixed).status).toBe("UNKNOWN");
  });
  it("has no affected cells for baseline", () => {
    expect(drill().totals.affected).toBe(0);
  });
  it("keeps original inventory states when no scenario is applied", () => {
    const result = drill("baseline", mixed);
    expect(result.cells.every((cell) => cell.before === cell.after)).toBe(true);
  });
  it("retains total listed bytes", () => {
    expect(drill().totals.listedBytes).toBe(160);
  });
  it("retains zero byte cells in the listing", () => {
    const record = drill().cells.find((cell) => cell.id === "e");
    expect(record?.expectedBytes).toBe(0);
    expect(record?.after).toBe("saved");
  });
  it("counts saved inventory copies exactly", () => {
    expect(drill("baseline", mixed).totals.beforeSaved).toBe(2);
  });
  it("counts unknown inventory copies exactly", () => {
    expect(drill("baseline", mixed).totals.beforeUnknown).toBe(3);
  });
  it("does not overwrite the declared source", () => {
    expect(drill().cells[0]?.provenance).toEqual(alpha);
  });
  it("retains ordered IDs", () => {
    expect(drill().cells.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("treats absent inventory as UNKNOWN", () => {
    const result = drill("baseline", null);
    expect(result.status).toBe("UNKNOWN");
    expect(result.confidence).toBe("UNKNOWN");
    expect(result.findings).toContain("inventory-unavailable");
  });
  it("keeps every cell UNKNOWN when inventory is absent", () => {
    const result = drill("baseline", null);
    expect(result.cells.every((cell) => cell.after === "UNKNOWN")).toBe(true);
  });
  it("does not infer local free storage without an estimate", () => {
    expect(drill("baseline", all, {}, {}).quota.freeBytes).toBeNull();
  });
  it("handles usage greater than quota conservatively", () => {
    expect(drill("baseline", all, {}, { quota: 5, usage: 8 }).quota.freeBytes).toBeNull();
  });
  it("handles negative estimates conservatively", () => {
    expect(drill("baseline", all, {}, { quota: -1, usage: 0 }).quota.freeBytes).toBeNull();
  });
  it("handles nonfinite estimates conservatively", () => {
    expect(drill("baseline", all, {}, { quota: Number.POSITIVE_INFINITY, usage: 0 }).quota.freeBytes).toBeNull();
  });
  it("reports known free storage in whole bytes", () => {
    expect(drill("baseline", all, {}, { quota: 100.8, usage: 20.1 }).quota.freeBytes).toBe(80);
  });
  it("reports prospective free storage without claiming a write", () => {
    expect(drill().quota.projectedFreeBytes).toBe(4_000_000);
  });
  it("does not report a positive state for unreadable inventory", () => {
    const result = drill("evict-largest", mixed);
    expect(result.status).toBe("UNKNOWN");
  });
  it("rejects a blank region ID", () => {
    expect(runContinuityDrill({ ...manifest, regionId: " " }, all).status).toBe("UNKNOWN");
  });
  it("rejects a duplicate manifest identifier", () => {
    const invalid: RegionManifest = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] };
    const result = runContinuityDrill(invalid, inventory([row("a")]));
    expect(result.findings).toContain("duplicate-manifest-id");
    expect(result.status).toBe("UNKNOWN");
  });
  it("rejects a duplicate inventory identifier", () => {
    const result = drill("baseline", inventory([row("a"), row("a")]));
    expect(result.findings).toContain("duplicate-inventory");
    expect(result.status).toBe("UNKNOWN");
  });
  it("rejects inventory for another region", () => {
    const result = drill("baseline", { ...all, regionId: "elsewhere" });
    expect(result.findings).toContain("region-mismatch");
  });
  it("rejects unlisted inventory data", () => {
    const result = drill("baseline", inventory([...all.cells, { ...row("a"), id: "foreign" }]));
    expect(result.findings).toContain("unlisted-cell");
  });
  it("rejects inconsistent saved and unknown counts", () => {
    const result = drill("baseline", { ...all, savedCount: 1 });
    expect(result.findings).toContain("inventory-count-mismatch");
  });
  it("rejects missing source names", () => {
    const malformed: RegionManifest = {
      ...manifest, cells: [{ id: "a", bytes: 10, provenance: { ...alpha, source: "" } }],
    };
    expect(runContinuityDrill(malformed, inventory([row("a")])).findings).toContain("invalid-source");
  });
  it("rejects unsupported source licences", () => {
    const malformed: RegionManifest = {
      ...manifest, cells: [{ id: "a", bytes: 10, provenance: { ...alpha, licence: "Private" } }],
    };
    expect(runContinuityDrill(malformed, inventory([row("a")])).findings).toContain("invalid-source");
  });
  it("rejects impossible calendar dates", () => {
    const malformed: RegionManifest = {
      ...manifest, cells: [{ id: "a", bytes: 10, provenance: { ...alpha, date: "2026-02-30" } }],
    };
    expect(runContinuityDrill(malformed, inventory([row("a")])).findings).toContain("invalid-source");
  });
  it("rejects negative sizes", () => {
    const malformed: RegionManifest = {
      ...manifest, cells: [{ id: "a", bytes: -1, provenance: alpha }],
    };
    expect(runContinuityDrill(malformed, inventory([row("a")])).findings).toContain("invalid-cell-size");
  });
  it("rejects non-integer sizes", () => {
    const malformed: RegionManifest = {
      ...manifest, cells: [{ id: "a", bytes: 1.5, provenance: alpha }],
    };
    expect(runContinuityDrill(malformed, inventory([row("a")])).findings).toContain("invalid-cell-size");
  });
  it("rejects excessive cell counts", () => {
    const tooMany: RegionManifest = { regionId: "big", cells: Array.from({ length: MAX_DRILL_CELLS + 1 },
      (_, i) => ({ id: String(i), bytes: 1, provenance: alpha })) };
    expect(runContinuityDrill(tooMany, null).findings).toContain("too-many-manifest-cells");
  });
  it("rejects excessive affected counts", () => {
    expect(() => drill("evict-largest", all, { affectedCount: MAX_DRILL_AFFECTED + 1 })).toThrow();
  });
  it("rejects fractional affected counts", () => {
    expect(() => drill("evict-largest", all, { affectedCount: 0.5 })).toThrow();
  });
  it("rejects negative affected counts", () => {
    expect(() => drill("evict-largest", all, { affectedCount: -1 })).toThrow();
  });
  it("rejects negative hypothetical reductions", () => {
    expect(() => drill("quota-reduction", all, { reductionBytes: -1 })).toThrow();
  });
  it("rejects negative reserve margins", () => {
    expect(() => drill("quota-reduction", all, { preserveReserveBytes: -1 })).toThrow();
  });
  it("rejects invalid scenario identifiers", () => {
    expect(() => drill("incorrect" as DrillScenario)).toThrow();
  });
  it("rejects reductions exceeding safe integer limits", () => {
    expect(() => drill("quota-reduction", all, { reductionBytes: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
  });
});

describe("continuity scenarios", () => {
  it("evicts the largest matching saved cell first", () => {
    const result = drill("evict-largest");
    expect(result.cells.find((item) => item.id === "d")?.affected).toBe(true);
  });
  it("does not evict smaller cells unnecessarily", () => {
    const result = drill("evict-largest");
    expect(result.cells.find((item) => item.id === "a")?.affected).toBe(false);
  });
  it("evicts the oldest source date first", () => {
    const result = drill("evict-oldest");
    expect(result.cells.find((item) => item.id === "a")?.affected).toBe(true);
  });
  it("breaks equal source-date ties by listed order", () => {
    const result = drill("evict-oldest", all, { affectedCount: 2 });
    expect(result.cells.filter((item) => item.affected).map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("can simulate a metadata change without modifying source metadata", () => {
    const result = drill("source-change");
    const item = result.cells.find((cell) => cell.id === "a");
    expect(item?.reason).toBe("simulated-source-change");
    expect(item?.provenance).toEqual(alpha);
  });
  it("never promotes a simulated failure to a saved state", () => {
    for (const scenario of ["evict-largest", "evict-oldest", "source-change"] as const) {
      const result = drill(scenario);
      expect(result.cells.filter((item) => item.affected).every((item) => item.after === "UNKNOWN")).toBe(true);
    }
  });
  it("retains the baseline state in the before field", () => {
    const result = drill("evict-largest");
    expect(result.cells.find((cell) => cell.id === "d")?.before).toBe("saved");
  });
  it("marks only selected cells as affected", () => {
    const result = drill("evict-largest", all, { affectedCount: 3 });
    expect(result.totals.affected).toBe(3);
  });
  it("caps selected cells at available saved copies", () => {
    const result = drill("evict-largest", all, { affectedCount: 100 });
    expect(result.totals.affected).toBe(5);
  });
  it("does not evict an already missing cell", () => {
    const result = drill("evict-largest", mixed, { affectedCount: 1 });
    expect(result.cells.find((cell) => cell.id === "b")?.affected).toBe(false);
  });
  it("does not evict an unreadable cell", () => {
    const result = drill("evict-largest", mixed, { affectedCount: 1 });
    expect(result.cells.find((cell) => cell.id === "d")?.affected).toBe(false);
  });
  it("does not evict a stale copy as though it were current", () => {
    const result = drill("evict-largest", mixed, { affectedCount: 1 });
    expect(result.cells.find((cell) => cell.id === "c")?.affected).toBe(false);
  });
  it("retains UNKNOWN when the inventory is missing", () => {
    const result = drill("evict-largest", null);
    expect(result.totals.afterSaved).toBe(0);
  });
  it("can simulate zero affected cells", () => {
    const result = drill("evict-largest", all, { affectedCount: 0 });
    expect(result.totals.affected).toBe(0);
  });
  it("accounts for hypothetical byte loss", () => {
    const result = drill("evict-largest", all, { affectedCount: 1 });
    expect(result.totals.hypotheticalLossBytes).toBe(80);
  });
  it("recomputes hypothetical saved bytes", () => {
    const result = drill("evict-largest", all, { affectedCount: 1 });
    expect(result.totals.afterSavedBytes).toBe(80);
  });
  it("handles missing quota conservatively in the quota scenario", () => {
    const result = drill("quota-reduction", all, {}, {});
    expect(result.status).toBe("UNKNOWN");
    expect(result.findings).toContain("quota-unknown");
  });
  it("does not assume an eviction if there is sufficient projected storage", () => {
    const result = drill("quota-reduction", all, { reductionBytes: 1 }, capacity);
    expect(result.totals.affected).toBe(0);
  });
  it("can simulate significant storage loss", () => {
    const result = drill("quota-reduction", all, { reductionBytes: 4_000_000 }, capacity);
    expect(result.totals.affected).toBeGreaterThan(0);
  });
  it("retains nonnegative hypothetical free space", () => {
    const result = drill("quota-reduction", all, { reductionBytes: 9_000_000 }, capacity);
    expect(result.quota.projectedFreeBytes).toBe(0);
  });
  it("retains exact source and licence in each simulated cell", () => {
    const result = drill("evict-oldest");
    expect(result.cells[0]?.provenance?.licence).toBe("CC BY 4.0");
  });
  it("uses a different reason for simulated capacity", () => {
    const result = drill("quota-reduction", all, { reductionBytes: 4_000_000 }, capacity);
    expect(result.cells.some((cell) => cell.reason === "simulated-capacity")).toBe(true);
  });
  it("retains unaltered metadata for unaffected cells", () => {
    const result = drill("evict-largest");
    expect(result.cells[0]?.provenance).toEqual(alpha);
  });
  it("does not mutate the settings object", () => {
    const opts = settings("evict-largest", { affectedCount: 2 });
    const before = JSON.stringify(opts);
    runContinuityDrill(manifest, all, opts);
    expect(JSON.stringify(opts)).toBe(before);
  });
});

describe("continuity search and pagination", () => {
  const baseline = drill();
  const affected = drill("evict-largest", all, { affectedCount: 2 });
  const query = (search = "", filter: "all" | "saved" | "UNKNOWN" | "affected" | "unaffected" = "all",
    sort: "listed" | "id" | "bytes-desc" | "status" | "source" = "listed", offset = 0, limit = 12) =>
    pageContinuityDrill(affected, { search, filter, sort, offset, limit });
  it("starts at the first listed cell", () => {
    expect(query().rows[0]?.id).toBe("a");
  });
  it("finds cells case insensitively", () => {
    expect(query(" A ").rows.map((item) => item.id)).toEqual(["a", "c", "d", "e"]);
  });
  it("searches source names", () => {
    expect(query("municipal").rows.map((item) => item.id)).toEqual(["c"]);
  });
  it("searches licence values", () => {
    expect(query("CC0").rows.map((item) => item.id)).toEqual(["c"]);
  });
  it("searches provenance dates", () => {
    expect(query("2024-01").rows.map((item) => item.id)).toEqual(["a", "b"]);
  });
  it("searches reason values", () => {
    expect(query("simulated-eviction").rows).toHaveLength(2);
  });
  it("filters affected cells", () => {
    expect(query("", "affected").rows).toHaveLength(2);
  });
  it("filters unaffected cells", () => {
    expect(query("", "unaffected").rows).toHaveLength(3);
  });
  it("filters saved after the scenario", () => {
    expect(query("", "saved").rows).toHaveLength(3);
  });
  it("filters UNKNOWN after the scenario", () => {
    expect(query("", "UNKNOWN").rows).toHaveLength(2);
  });
  it("sorts largest first", () => {
    expect(query("", "all", "bytes-desc").rows[0]?.id).toBe("d");
  });
  it("sorts by identifier", () => {
    expect(query("", "all", "id").rows.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("sorts by status deterministically", () => {
    expect(query("", "all", "status")).toEqual(query("", "all", "status"));
  });
  it("sorts by source name deterministically", () => {
    expect(query("", "all", "source")).toEqual(query("", "all", "source"));
  });
  it("paginates without losing cells", () => {
    const ids: string[] = [];
    for (let offset = 0; offset < 5; offset += 1) {
      const page = query("", "all", "listed", offset, 1);
      expect(page.rows).toHaveLength(1);
      ids.push(page.rows[0]!.id);
      expect(page.previous).toBe(offset > 0);
      expect(page.next).toBe(offset < 4);
    }
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("caps page sizes", () => {
    expect(query("", "all", "listed", 0, 1_000).limit).toBe(MAX_DRILL_PAGE);
  });
  it("normalizes negative offsets", () => {
    expect(query("", "all", "listed", -10).offset).toBe(0);
  });
  it("normalizes noninteger limits", () => {
    expect(query("", "all", "listed", 0, 1.5).limit).toBe(12);
  });
  it("returns zero for nonexistent queries", () => {
    expect(query("no-such-cell").total).toBe(0);
  });
  it("does not mutate the original drill result", () => {
    const before = JSON.stringify(affected);
    query("", "all", "bytes-desc");
    expect(JSON.stringify(affected)).toBe(before);
  });
  it("preserves immutable baseline comparison", () => {
    expect(pageContinuityDrill(baseline, { search: "", filter: "all", sort: "listed", offset: 0, limit: 5 }).total).toBe(5);
  });
});

describe("continuity source grouping", () => {
  it("groups cells with identical exact source metadata", () => {
    expect(drillSourceSummary(drill())).toHaveLength(3);
  });
  it("counts each source group", () => {
    expect(drillSourceSummary(drill()).map((item) => item.count)).toEqual([2, 1, 2]);
  });
  it("counts matching saved cells per group", () => {
    expect(drillSourceSummary(drill())[0]?.afterSaved).toBe(2);
  });
  it("counts affected cells per group", () => {
    expect(drillSourceSummary(drill("evict-oldest", all, { affectedCount: 2 }))[0]?.affected).toBe(2);
  });
  it("does not merge different publication dates", () => {
    const modified: RegionManifest = { ...manifest, cells: [
      manifest.cells[0]!, { ...manifest.cells[1]!, provenance: { ...alpha, date: "2025-01-01" } },
    ] };
    expect(drillSourceSummary(runContinuityDrill(modified, null))).toHaveLength(2);
  });
  it("retains source metadata exactly", () => {
    expect(drillSourceSummary(drill())[0]?.source).toEqual(alpha);
  });
  it("never adds an inaccessible-cell assertion", () => {
    expect(JSON.stringify(drillSourceSummary(drill()))).not.toContain("accessible");
  });
});
