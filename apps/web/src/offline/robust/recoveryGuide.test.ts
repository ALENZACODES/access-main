import { describe, expect, it } from "vitest";
import type { RegionManifest, Provenance, StorageEstimate } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import {
  buildRecoveryPlan, pageRecoveryPlan, proposeRecoveryRequest,
  recoveryIssueCounts, recoverySourceGroups, storageFree,
  GUIDE_DEFAULT_RESERVE_BYTES, GUIDE_MAX_CELL_BYTES, GUIDE_MAX_RECOVERY_CELLS, GUIDE_MAX_REQUEST_CELLS,
  type GuideFilter, type GuideOrder, type GuidePlan,
} from "./recoveryGuide";

const primary: Provenance = {
  source: "Provincial open information", licence: "CC BY 4.0", date: "2026-04-02",
};
const secondary: Provenance = {
  source: "Municipal open information", licence: "CC0 1.0", date: "2026-05-12",
};
const region: RegionManifest = {
  regionId: "central",
  cells: [
    { id: "alpha", bytes: 10, provenance: primary },
    { id: "bravo", bytes: 20, provenance: primary },
    { id: "charlie", bytes: 30, provenance: secondary },
    { id: "delta", bytes: 40, provenance: secondary },
  ],
};

function row(
  id: string, cause: InventoryCell["cause"],
  extra: Partial<InventoryCell> = {},
): InventoryCell {
  const listed = region.cells.find((cell) => cell.id === id);
  if (!listed) throw new Error(`No listed cell: ${id}`);
  return {
    id, expectedBytes: listed.bytes, provenance: listed.provenance,
    cause, state: cause === "present" ? "saved" : "unknown", ...extra,
  };
}

function observed(cells: readonly InventoryCell[]): RegionInventory {
  const saved = cells.filter((cell) => cell.state === "saved");
  return {
    regionId: "central", cells,
    savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    expectedBytes: cells.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    savedBytes: saved.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    complete: saved.length === cells.length,
  };
}

function sample(estimate: StorageEstimate = { quota: 10_000_000, usage: 0 }): GuidePlan {
  return buildRecoveryPlan(region, observed([
    row("alpha", "present"), row("bravo", "missing"),
    row("charlie", "stale"), row("delta", "unreadable"),
  ]), estimate);
}

function usable(): GuidePlan {
  return buildRecoveryPlan(region, observed([
    row("alpha", "present"), row("bravo", "missing"),
    row("charlie", "stale"), row("delta", "present"),
  ]), { quota: 10_000_000, usage: 0 });
}

function page(plan: GuidePlan, overrides: Partial<Parameters<typeof pageRecoveryPlan>[1]> = {}) {
  return pageRecoveryPlan(plan, {
    text: "", filter: "all", order: "listed", start: 0, limit: 12,
    ...overrides,
  });
}

describe("offline recovery guide classification", () => {
  it("counts saved, missing, stale and unreadable distinctly", () => {
    const plan = sample();
    expect(plan.totals.listed).toBe(4);
    expect(plan.totals.saved).toBe(1);
    expect(plan.totals.unknown).toBe(3);
    expect(plan.totals.retry).toBe(2);
    expect(plan.totals.inspect).toBe(1);
    expect(plan.totals.source).toBe(0);
  });

  it("keeps unreadable local copies out of recovery requests", () => {
    const plan = sample();
    expect(plan.gate).toBe("UNKNOWN");
    expect(plan.cells[3]?.issue).toBe("unreadable");
    expect(plan.cells[3]?.retryAllowed).toBe(false);
    expect(plan.cells[3]?.state).toBe("UNKNOWN");
    expect(proposeRecoveryRequest(plan, ["delta"]).ids).toEqual([]);
  });

  it("treats an exact matching saved copy as saved", () => {
    const plan = usable();
    expect(plan.cells[0]).toMatchObject({
      id: "alpha", state: "saved", issue: null,
      action: "none", retryAllowed: false,
    });
  });

  it("names a missing copy without claiming it has been downloaded", () => {
    const plan = usable();
    expect(plan.cells[1]).toMatchObject({
      id: "bravo", state: "UNKNOWN", issue: "missing",
      action: "retry", retryAllowed: true,
    });
  });

  it("names a stale copy without treating old metadata as current", () => {
    const plan = usable();
    expect(plan.cells[2]).toMatchObject({
      id: "charlie", state: "UNKNOWN", issue: "stale",
      action: "retry", retryAllowed: true,
    });
  });

  it("does not infer evidence tier from successful local bytes", () => {
    const plan = usable();
    const encoded = JSON.stringify(plan);
    expect(encoded).not.toContain("documented");
    expect(plan.cells[0]?.state).toBe("saved");
    expect(plan.cells[1]?.state).toBe("UNKNOWN");
  });

  it("rejects inventory belonging to a different region", () => {
    const inventory = { ...observed([row("alpha", "present")]), regionId: "west" };
    const plan = buildRecoveryPlan(region, inventory, {});
    expect(plan.gate).toBe("UNKNOWN");
    expect(plan.totals.saved).toBe(0);
    expect(plan.totals.retry).toBe(0);
    expect(plan.issues).toContain("inventory-unavailable");
  });

  it("fails closed when the inventory is missing", () => {
    const plan = buildRecoveryPlan(region, null, {});
    expect(plan.gate).toBe("UNKNOWN");
    expect(plan.totals.unknown).toBe(4);
    expect(plan.cells.every((cell) => !cell.retryAllowed)).toBe(true);
  });

  it("does not mark an uninspected cell as not downloaded", () => {
    const plan = buildRecoveryPlan(region, observed([row("alpha", "present")]),
      { quota: 10_000_000, usage: 0 });
    expect(plan.cells[1]?.issue).toBe("unreadable");
    expect(plan.cells[1]?.state).toBe("UNKNOWN");
    expect(plan.gate).toBe("UNKNOWN");
  });

  it("blocks duplicate inventory identifiers", () => {
    const inventory = observed([row("alpha", "present"), row("alpha", "present")]);
    const plan = buildRecoveryPlan(region, inventory, {});
    expect(plan.issues).toContain("duplicate");
    expect(plan.totals.saved).toBe(0);
    expect(plan.totals.retry).toBe(0);
  });

  it("blocks duplicate manifest identifiers", () => {
    const invalid: RegionManifest = { ...region, cells: [region.cells[0]!, region.cells[0]!] };
    const plan = buildRecoveryPlan(invalid, observed([]), {});
    expect(plan.issues).toContain("duplicate");
    expect(plan.gate).toBe("UNKNOWN");
  });

  it("blocks unlisted inventory identifiers", () => {
    const outsider: InventoryCell = {
      id: "outsider", state: "saved", cause: "present",
      expectedBytes: 9, provenance: primary,
    };
    const plan = buildRecoveryPlan(region, observed([outsider]), {});
    expect(plan.issues).toContain("unlisted");
    expect(plan.totals.retry).toBe(0);
  });

  it("does not accept a changed source for a saved cell", () => {
    const plan = buildRecoveryPlan(region, observed([
      row("alpha", "present", { provenance: secondary }),
      row("bravo", "present"), row("charlie", "present"), row("delta", "present"),
    ]), { quota: 10_000_000, usage: 0 });
    expect(plan.cells[0]?.issue).toBe("metadata-conflict");
    expect(plan.cells[0]?.state).toBe("UNKNOWN");
    expect(plan.cells[0]?.action).toBe("review-source");
  });

  it("does not accept a changed licence for a saved cell", () => {
    const plan = buildRecoveryPlan(region, observed([
      row("alpha", "present", { provenance: { ...primary, licence: "CC0 1.0" } }),
      row("bravo", "present"), row("charlie", "present"), row("delta", "present"),
    ]), { quota: 10_000_000, usage: 0 });
    expect(plan.cells[0]?.issue).toBe("metadata-conflict");
    expect(plan.cells[0]?.retryAllowed).toBe(false);
  });

  it("does not accept a changed date for a saved cell", () => {
    const plan = buildRecoveryPlan(region, observed([
      row("alpha", "present", { provenance: { ...primary, date: "2026-04-03" } }),
      row("bravo", "present"), row("charlie", "present"), row("delta", "present"),
    ]), { quota: 10_000_000, usage: 0 });
    expect(plan.cells[0]?.issue).toBe("metadata-conflict");
    expect(plan.cells[0]?.state).toBe("UNKNOWN");
  });

  it("does not accept a changed byte count", () => {
    const inventory = observed([
      row("alpha", "present", { expectedBytes: 11 }), row("bravo", "present"),
      row("charlie", "present"), row("delta", "present"),
    ]);
    expect(buildRecoveryPlan(region, inventory, {}).cells[0]?.issue).toBe("metadata-conflict");
  });

  it("does not accept an unknown state with present cause", () => {
    const inventory = observed([
      row("alpha", "present", { state: "unknown" }), row("bravo", "present"),
      row("charlie", "present"), row("delta", "present"),
    ]);
    expect(buildRecoveryPlan(region, inventory, {}).cells[0]?.issue).toBe("unreadable");
  });

  it("does not accept a saved state with missing cause", () => {
    const inventory = observed([
      row("alpha", "missing", { state: "saved" }), row("bravo", "present"),
      row("charlie", "present"), row("delta", "present"),
    ]);
    expect(buildRecoveryPlan(region, inventory, {}).cells[0]?.retryAllowed).toBe(false);
  });

  it("records the observed metadata in conflicting copies", () => {
    const inventory = observed([
      row("alpha", "present", { provenance: secondary }), row("bravo", "present"),
      row("charlie", "present"), row("delta", "present"),
    ]);
    const conflict = buildRecoveryPlan(region, inventory, {}).cells[0];
    expect(conflict?.provenance).toEqual(primary);
    expect(conflict?.observed).toEqual(secondary);
  });

  it("rejects blank region identifiers", () => {
    const plan = buildRecoveryPlan({ ...region, regionId: "" }, observed([]), {});
    expect(plan.issues).toContain("invalid-listing");
  });

  it("rejects blank cell identifiers", () => {
    const invalid = { ...region, cells: [{ ...region.cells[0]!, id: "" }] };
    expect(buildRecoveryPlan(invalid, observed([]), {}).issues).toContain("invalid-listing");
  });

  it("rejects traversal-like identifiers", () => {
    const invalid = { ...region, cells: [{ ...region.cells[0]!, id: "path..segment" }] };
    expect(buildRecoveryPlan(invalid, observed([]), {}).issues).toContain("invalid-listing");
  });

  it("rejects a non-open licence", () => {
    const invalid = { ...region, cells: [{ ...region.cells[0]!,
      provenance: { ...primary, licence: "Restricted use" } }] };
    const plan = buildRecoveryPlan(invalid, observed([]), {});
    expect(plan.issues).toContain("invalid-listing");
    expect(plan.totals.retry).toBe(0);
  });

  it("rejects impossible dates", () => {
    const invalid = { ...region, cells: [{ ...region.cells[0]!,
      provenance: { ...primary, date: "2026-02-30" } }] };
    expect(buildRecoveryPlan(invalid, observed([]), {}).gate).toBe("UNKNOWN");
  });

  it("accepts canonical leap-year dates", () => {
    const manifest = { ...region, cells: [{ ...region.cells[0]!,
      provenance: { ...primary, date: "2024-02-29" } }] };
    expect(buildRecoveryPlan(manifest, observed([]), {}).issues).not.toContain("invalid-listing");
  });

  it("rejects control characters in source metadata", () => {
    const manifest = { ...region, cells: [{ ...region.cells[0]!,
      provenance: { ...primary, source: "bad\nsource" } }] };
    expect(buildRecoveryPlan(manifest, observed([]), {}).issues).toContain("invalid-listing");
  });

  it("rejects bidi overrides in source metadata", () => {
    const manifest = { ...region, cells: [{ ...region.cells[0]!,
      provenance: { ...primary, source: "bad\u202egood" } }] };
    expect(buildRecoveryPlan(manifest, observed([]), {}).issues).toContain("invalid-listing");
  });

  it("rejects negative cell sizes", () => {
    const invalid = { ...region, cells: [{ ...region.cells[0]!, bytes: -1 }] };
    expect(buildRecoveryPlan(invalid, observed([]), {}).gate).toBe("UNKNOWN");
  });

  it("rejects fractional cell sizes", () => {
    const invalid = { ...region, cells: [{ ...region.cells[0]!, bytes: 1.5 }] };
    expect(buildRecoveryPlan(invalid, observed([]), {}).gate).toBe("UNKNOWN");
  });

  it("rejects excessive cell sizes", () => {
    const invalid = { ...region, cells: [{ ...region.cells[0]!, bytes: GUIDE_MAX_CELL_BYTES + 1 }] };
    expect(buildRecoveryPlan(invalid, observed([]), {}).gate).toBe("UNKNOWN");
  });

  it("exposes a clear maximum for selected recovery cells", () => {
    expect(GUIDE_MAX_REQUEST_CELLS).toBeGreaterThan(0);
    expect(GUIDE_MAX_REQUEST_CELLS).toBeLessThan(GUIDE_MAX_RECOVERY_CELLS);
  });

  it("records a fixed nonzero default reserve", () => {
    expect(GUIDE_DEFAULT_RESERVE_BYTES).toBe(1_048_576);
    expect(usable().reserveBytes).toBe(GUIDE_DEFAULT_RESERVE_BYTES);
  });

  it("requires a valid storage reserve", () => {
    for (const reserve of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildRecoveryPlan(region, observed([]), {}, reserve)).toThrow();
    }
  });
});

describe("offline recovery guide storage estimates", () => {
  it("uses the browser's quota and usage only when both are present", () => {
    expect(storageFree({ quota: 10_000, usage: 2_000 })).toBe(8_000);
    expect(storageFree({ quota: 10_000 })).toBeNull();
    expect(storageFree({ usage: 2_000 })).toBeNull();
  });

  it("rejects negative usage", () => {
    expect(storageFree({ quota: 10_000, usage: -1 })).toBeNull();
  });

  it("rejects negative quota", () => {
    expect(storageFree({ quota: -1, usage: 0 })).toBeNull();
  });

  it("rejects usage exceeding quota", () => {
    expect(storageFree({ quota: 10, usage: 11 })).toBeNull();
  });

  it("rejects fractional quota", () => {
    expect(storageFree({ quota: 1.5, usage: 0 })).toBeNull();
  });

  it("rejects fractional usage", () => {
    expect(storageFree({ quota: 10, usage: 1.2 })).toBeNull();
  });

  it("rejects infinite quota", () => {
    expect(storageFree({ quota: Infinity, usage: 0 })).toBeNull();
  });

  it("rejects non-number values and no readings", () => {
    expect(storageFree({})).toBeNull();
    expect(storageFree({ quota: NaN, usage: 0 })).toBeNull();
  });

  it("accounts for the reserved margin exactly", () => {
    const enough = buildRecoveryPlan(region, observed([
      row("alpha", "present"), row("bravo", "missing"),
      row("charlie", "present"), row("delta", "present"),
    ]), { quota: 1_048_596, usage: 0 });
    const insufficient = buildRecoveryPlan(region, observed([
      row("alpha", "present"), row("bravo", "missing"),
      row("charlie", "present"), row("delta", "present"),
    ]), { quota: 1_048_595, usage: 0 });
    expect(enough.retryEstimate).toBe("yes");
    expect(enough.gate).toBe("ready");
    expect(insufficient.retryEstimate).toBe("no");
    expect(insufficient.gate).toBe("blocked");
  });

  it("does not report a quota estimate as a completed download", () => {
    const plan = usable();
    expect(plan.gate).toBe("ready");
    expect(plan.cells[1]?.state).toBe("UNKNOWN");
    expect(plan.cells[2]?.state).toBe("UNKNOWN");
  });

  it("returns UNKNOWN if estimates are unavailable", () => {
    const plan = buildRecoveryPlan(region, observed([
      row("alpha", "present"), row("bravo", "missing"),
      row("charlie", "present"), row("delta", "present"),
    ]), {});
    expect(plan.retryEstimate).toBe("UNKNOWN");
    expect(plan.gate).toBe("UNKNOWN");
    expect(plan.issues).toContain("storage-unknown");
  });

  it("blocks low-storage retries without changing cell states", () => {
    const plan = buildRecoveryPlan(region, observed([
      row("alpha", "present"), row("bravo", "missing"),
      row("charlie", "present"), row("delta", "present"),
    ]), { quota: 100, usage: 0 });
    expect(plan.gate).toBe("blocked");
    expect(plan.issues).toContain("storage-low");
    expect(plan.cells[1]?.state).toBe("UNKNOWN");
  });

  it("treats storage readings as advisory, not accessibility facts", () => {
    const plan = usable();
    expect(plan.freeBytes).toBe(10_000_000);
    expect(plan.cells[0]?.state).toBe("saved");
    expect(plan.cells[1]?.state).toBe("UNKNOWN");
    expect(plan.cells[2]?.state).toBe("UNKNOWN");
  });

  it("reports listed and retry byte sums independently", () => {
    const plan = usable();
    expect(plan.totals.listedBytes).toBe(100);
    expect(plan.totals.retryBytes).toBe(50);
  });

  it("reports missing inventory sums as UNKNOWN instead of zero", () => {
    const plan = buildRecoveryPlan(region, null, {});
    expect(plan.totals.listedBytes).toBeNull();
    expect(plan.totals.retryBytes).toBeNull();
  });

  it("accepts exact zero-length cells when the manifest permits them", () => {
    const empty: RegionManifest = {
      regionId: "empty", cells: [{ id: "zero", bytes: 0, provenance: primary }],
    };
    const inventory: RegionInventory = {
      ...observed([]), regionId: "empty", cells: [{
        id: "zero", expectedBytes: 0, provenance: primary, state: "unknown", cause: "missing",
      }],
    };
    const plan = buildRecoveryPlan(empty, inventory, { quota: 2_000_000, usage: 0 });
    expect(plan.totals.retryBytes).toBe(0);
    expect(plan.totals.retry).toBe(1);
    expect(plan.cells[0]?.state).toBe("UNKNOWN");
  });
});

describe("offline recovery guide pagination and search", () => {
  it("preserves manifest order by default", () => {
    expect(page(usable()).cells.map((cell) => cell.id)).toEqual([
      "alpha", "bravo", "charlie", "delta",
    ]);
  });

  it("filters saved copies without using source age as evidence", () => {
    expect(page(usable(), { filter: "saved" }).cells.map((cell) => cell.id)).toEqual([
      "alpha", "delta",
    ]);
  });

  it("filters UNKNOWN copies explicitly", () => {
    expect(page(usable(), { filter: "unknown" }).cells.map((cell) => cell.id)).toEqual([
      "bravo", "charlie",
    ]);
  });

  it("filters manual retry candidates", () => {
    expect(page(usable(), { filter: "retry" }).cells.map((cell) => cell.id)).toEqual([
      "bravo", "charlie",
    ]);
  });

  it("filters unreadable copies needing inspection", () => {
    expect(page(sample(), { filter: "inspect" }).cells.map((cell) => cell.id)).toEqual(["delta"]);
  });

  it("filters conflicting records needing source review", () => {
    const inventory = observed([
      row("alpha", "present", { provenance: secondary }),
      row("bravo", "present"), row("charlie", "present"), row("delta", "present"),
    ]);
    const plan = buildRecoveryPlan(region, inventory, { quota: 10_000_000, usage: 0 });
    expect(page(plan, { filter: "source" }).cells.map((cell) => cell.id)).toEqual(["alpha"]);
  });

  it("matches IDs without case sensitivity", () => {
    expect(page(usable(), { text: " BRAVO " }).cells.map((cell) => cell.id)).toEqual(["bravo"]);
  });

  it("matches source names", () => {
    expect(page(usable(), { text: "municipal" }).cells.map((cell) => cell.id)).toEqual([
      "charlie", "delta",
    ]);
  });

  it("matches licences", () => {
    expect(page(usable(), { text: "cc0" }).cells.map((cell) => cell.id)).toEqual([
      "charlie", "delta",
    ]);
  });

  it("matches source dates", () => {
    expect(page(usable(), { text: "2026-04" }).cells.map((cell) => cell.id)).toEqual([
      "alpha", "bravo",
    ]);
  });

  it("sorts by ID", () => {
    expect(page(usable(), { order: "id" }).cells.map((cell) => cell.id)).toEqual([
      "alpha", "bravo", "charlie", "delta",
    ]);
  });

  it("sorts by size descending", () => {
    expect(page(usable(), { order: "bytes-large" }).cells.map((cell) => cell.id)).toEqual([
      "delta", "charlie", "bravo", "alpha",
    ]);
  });

  it("sorts by size ascending", () => {
    expect(page(usable(), { order: "bytes-small" }).cells.map((cell) => cell.id)).toEqual([
      "alpha", "bravo", "charlie", "delta",
    ]);
  });

  it("sorts by suggested action deterministically", () => {
    const plan = usable();
    expect(page(plan, { order: "action" })).toEqual(page(plan, { order: "action" }));
  });

  it("caps page sizes at 100", () => {
    expect(page(usable(), { limit: 10_000 }).limit).toBe(100);
  });

  it("uses 12 as a suitable default when a limit is invalid", () => {
    expect(page(usable(), { limit: NaN }).limit).toBe(12);
  });

  it("does not accept negative offsets", () => {
    expect(page(usable(), { start: -100 }).start).toBe(0);
  });

  it("does not accept fractional offsets", () => {
    expect(page(usable(), { start: 1.5 }).start).toBe(0);
  });

  it("paginates one cell at a time without dropping any", () => {
    const plan = usable();
    const seen: string[] = [];
    for (let start = 0; start < 4; start += 1) {
      const result = page(plan, { start, limit: 1 });
      expect(result.cells).toHaveLength(1);
      expect(result.previous).toBe(start > 0);
      expect(result.next).toBe(start < 3);
      const first = result.cells[0];
      if (!first) throw new Error("Missing paginated cell");
      seen.push(first.id);
    }
    expect(seen).toEqual(["alpha", "bravo", "charlie", "delta"]);
  });

  it("returns an empty page when the search matches nothing", () => {
    const result = page(usable(), { text: "not-a-cell" });
    expect(result.cells).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.next).toBe(false);
  });

  it("does not mutate the input plan when sorting", () => {
    const plan = usable();
    const before = plan.cells.map((cell) => cell.id);
    page(plan, { order: "bytes-large" });
    expect(plan.cells.map((cell) => cell.id)).toEqual(before);
  });

  it("supports every filter with valid pagination metadata", () => {
    const filters: GuideFilter[] = ["all", "saved", "unknown", "retry", "inspect", "source"];
    for (const filter of filters) {
      const result = page(sample(), { filter });
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.limit).toBe(12);
      expect(result.cells.length).toBeLessThanOrEqual(12);
    }
  });

  it("supports every ordering without losing the full unfiltered set", () => {
    const orders: GuideOrder[] = ["listed", "id", "bytes-large", "bytes-small", "action"];
    for (const order of orders) {
      const result = page(usable(), { order });
      expect(result.cells).toHaveLength(4);
      expect(new Set(result.cells.map((cell) => cell.id)).size).toBe(4);
    }
  });
});

describe("offline recovery guide explicit selection", () => {
  it("allows a single eligible cell with adequate headroom", () => {
    expect(proposeRecoveryRequest(usable(), ["bravo"])).toMatchObject({
      gate: "ready", ids: ["bravo"], eligibleBytes: 20, reasons: [],
    });
  });

  it("allows multiple distinct eligible cells", () => {
    expect(proposeRecoveryRequest(usable(), ["bravo", "charlie"])).toMatchObject({
      gate: "ready", ids: ["bravo", "charlie"], eligibleBytes: 50,
    });
  });

  it("refuses an empty selection", () => {
    expect(proposeRecoveryRequest(usable(), [])).toMatchObject({
      gate: "blocked", ids: [], eligibleBytes: 0,
    });
  });

  it("refuses saved cells", () => {
    expect(proposeRecoveryRequest(usable(), ["alpha"]).reasons).toContain("not-eligible");
  });

  it("refuses unlisted cells", () => {
    expect(proposeRecoveryRequest(usable(), ["unknown-cell"]).reasons).toContain("not-eligible");
  });

  it("refuses repeated selections", () => {
    expect(proposeRecoveryRequest(usable(), ["bravo", "bravo"]).reasons)
      .toContain("duplicate-selection");
  });

  it("refuses any mixture containing an ineligible ID", () => {
    const request = proposeRecoveryRequest(usable(), ["bravo", "alpha"]);
    expect(request.gate).toBe("blocked");
    expect(request.ids).toEqual([]);
  });

  it("does not offer a retry while the inventory is unreadable", () => {
    const request = proposeRecoveryRequest(sample(), ["bravo"]);
    expect(request.gate).toBe("blocked");
    expect(request.reasons).toContain("gate-not-ready");
  });

  it("does not offer a retry while storage is unknown", () => {
    const plan = buildRecoveryPlan(region, observed([
      row("alpha", "present"), row("bravo", "missing"),
      row("charlie", "present"), row("delta", "present"),
    ]), {});
    expect(proposeRecoveryRequest(plan, ["bravo"]).ids).toEqual([]);
  });

  it("does not offer a retry while the estimated space is too low", () => {
    const plan = buildRecoveryPlan(region, observed([
      row("alpha", "present"), row("bravo", "missing"),
      row("charlie", "present"), row("delta", "present"),
    ]), { quota: 1_048_580, usage: 0 });
    expect(proposeRecoveryRequest(plan, ["bravo"]).gate).toBe("blocked");
  });

  it("refuses more than the advertised selection limit", () => {
    const many = Array.from({ length: GUIDE_MAX_REQUEST_CELLS + 1 }, () => "bravo");
    expect(proposeRecoveryRequest(usable(), many).reasons).toContain("selection-limit");
  });

  it("never accepts a stored copy on the basis of a quota estimate", () => {
    const request = proposeRecoveryRequest(usable(), ["alpha"]);
    expect(request.ids).toEqual([]);
    expect(request.gate).toBe("blocked");
  });

  it("preserves the order of manually selected eligible IDs", () => {
    expect(proposeRecoveryRequest(usable(), ["charlie", "bravo"]).ids)
      .toEqual(["charlie", "bravo"]);
  });

  it("uses the correct region identifier", () => {
    expect(proposeRecoveryRequest(usable(), ["bravo"]).regionId).toBe("central");
  });

  it("does not modify the plan during a request proposal", () => {
    const plan = usable();
    const before = JSON.stringify(plan);
    proposeRecoveryRequest(plan, ["bravo"]);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("counts suggested actions without inferring storage success", () => {
    expect(recoveryIssueCounts(usable())).toEqual({
      retry: 2, inspect: 0, "review-source": 0, "free-space": 0, none: 2,
    });
  });

  it("groups sources by exact name, licence and date", () => {
    const groups = recoverySourceGroups(usable());
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      source: primary, saved: 1, unknown: 1, retry: 1, listedBytes: 30,
    });
    expect(groups[1]).toMatchObject({
      source: secondary, saved: 1, unknown: 1, retry: 1, listedBytes: 70,
    });
  });

  it("does not merge otherwise identical sources with different dates", () => {
    const manifest: RegionManifest = {
      ...region, cells: [region.cells[0]!, { ...region.cells[1]!,
        provenance: { ...primary, date: "2026-04-03" } }],
    };
    const plan = buildRecoveryPlan(manifest, observed([]), { quota: 10_000_000, usage: 0 });
    expect(recoverySourceGroups(plan)).toHaveLength(2);
  });
});
