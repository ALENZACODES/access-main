import { describe, expect, it } from "vitest";
import { type RegionManifest, type Provenance } from "./regionDownload";
import { type RegionInventory, type InventoryCell } from "./regionInventory";
import {
  assessManifestSafety, assessOfflineRegion, assessSources,
  assessRecoveryBudget, reviewAssessment, suggestRecoveryQueue,
  type ReviewFilter, type ReviewOrder,
} from "./updateAssessment";

/** A fixture element must exist; fail the test rather than accepting undefined. */
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture element");
  return value;
}

const first: Provenance = { source: "Ontario open data", licence: "CC BY 4.0", date: "2026-03-02" };
const second: Provenance = { source: "Municipal open data", licence: "CC0 1.0", date: "2026-02-01" };
const manifest: RegionManifest = {
  regionId: "central",
  cells: [
    { id: "alpha", bytes: 10, provenance: first },
    { id: "beta", bytes: 20, provenance: first },
    { id: "gamma", bytes: 30, provenance: second },
    { id: "delta", bytes: 40, provenance: second },
  ],
};

function cell(
  id: string, cause: InventoryCell["cause"], provenance: Provenance =
    id === "alpha" || id === "beta" ? first : second,
): InventoryCell {
  const target = manifest.cells.find((item) => item.id === id);
  return {
    id, cause, provenance,
    expectedBytes: target?.bytes ?? 0,
    state: cause === "present" ? "saved" : "unknown",
  };
}

function inventory(rows: readonly InventoryCell[]): RegionInventory {
  const saved = rows.filter((row) => row.state === "saved");
  return {
    regionId: manifest.regionId,
    cells: rows,
    savedCount: saved.length,
    unknownCount: rows.length - saved.length,
    savedBytes: saved.reduce((sum, row) => sum + row.expectedBytes, 0),
    expectedBytes: rows.reduce((sum, row) => sum + row.expectedBytes, 0),
    complete: saved.length === rows.length,
  };
}

function example() {
  return assessOfflineRegion(manifest, inventory([
    cell("alpha", "present"),
    cell("beta", "missing"),
    cell("gamma", "stale"),
    cell("delta", "unreadable"),
  ]));
}

describe("offline update assessment", () => {
  it("keeps saved data separate from missing, stale and unreadable states", () => {
    const result = example();
    expect(result.status).toBe("UNKNOWN");
    expect(result.counts).toEqual({
      saved: 1, unknown: 3, missing: 1, stale: 1, unreadable: 1, unlisted: 0,
    });
    expect(result.rows.map((row) => row.offlineStatus)).toEqual([
      "saved", "UNKNOWN", "UNKNOWN", "UNKNOWN",
    ]);
  });

  it("does not treat a missing inventory as a fully downloaded region", () => {
    const result = assessOfflineRegion(manifest, null);
    expect(result.status).toBe("UNKNOWN");
    expect(result.counts.unknown).toBe(4);
    expect(result.counts.saved).toBe(0);
    expect(result.savedBytes).toBeNull();
    expect(result.remainingBytes).toBeNull();
    expect(result.notes).toContain("inventory-unavailable");
    expect(suggestRecoveryQueue(result)).toEqual([]);
  });

  it("rejects an inventory for another region", () => {
    const result = assessOfflineRegion(manifest, { ...inventory([]), regionId: "outside" });
    expect(result.status).toBe("UNKNOWN");
    expect(result.notes).toContain("region-mismatch");
    expect(result.counts.saved).toBe(0);
  });

  it("identifies duplicate manifest cell identifiers", () => {
    const invalid = { ...manifest, cells: [required(manifest.cells[0]), required(manifest.cells[0])] };
    const failures = assessManifestSafety(invalid);
    expect(failures).toContain("duplicate-cell:alpha");
    expect(assessOfflineRegion(invalid, inventory([])).status).toBe("UNKNOWN");
  });

  it("identifies duplicate inventory identifiers", () => {
    const result = assessOfflineRegion(manifest, inventory([
      cell("alpha", "present"), cell("alpha", "present"),
    ]));
    expect(result.status).toBe("UNKNOWN");
    expect(result.notes).toContain("duplicate-inventory:alpha");
    expect(result.counts.saved).toBe(0);
  });

  it("rejects invalid size and missing data provenance", () => {
    const malformed: RegionManifest = {
      regionId: "central",
      cells: [
        { id: "bad", bytes: -1, provenance: first },
        { id: "empty-source", bytes: 1, provenance: { ...first, source: "" } },
        { id: "empty-licence", bytes: 1, provenance: { ...first, licence: "" } },
        { id: "bad-date", bytes: 1, provenance: { ...first, date: "2026-02-30" } },
      ],
    };
    expect(assessManifestSafety(malformed)).toHaveLength(4);
    const result = assessOfflineRegion(malformed, inventory([]));
    expect(result.status).toBe("UNKNOWN");
    expect(result.listedBytes).toBeNull();
    expect(result.sources).toHaveLength(0);
  });

  it("rejects a blank region ID", () => {
    expect(assessManifestSafety({ ...manifest, regionId: " " })).toContain("region-id");
  });

  it("marks a missing observation UNKNOWN instead of assuming missing", () => {
    const result = assessOfflineRegion(manifest, inventory([cell("alpha", "present")]));
    expect(required(result.rows[1])).toMatchObject({
      kind: "unreadable", offlineStatus: "UNKNOWN", advice: "inspect",
    });
  });

  it("does not equate a stale copy with a current saved copy", () => {
    const result = assessOfflineRegion(manifest, inventory([
      cell("alpha", "present"), cell("beta", "stale"),
      cell("gamma", "present"), cell("delta", "present"),
    ]));
    expect(result.status).toBe("partial");
    expect(required(result.rows[1]).advice).toBe("download");
    expect(result.counts.stale).toBe(1);
    expect(result.savedBytes).toBe(80);
    expect(result.remainingBytes).toBe(20);
  });

  it("reports completion only for all listed, matching copies", () => {
    const result = assessOfflineRegion(manifest, inventory([
      cell("alpha", "present"), cell("beta", "present"),
      cell("gamma", "present"), cell("delta", "present"),
    ]));
    expect(result.status).toBe("complete");
    expect(result.savedBytes).toBe(100);
    expect(result.remainingBytes).toBe(0);
    expect(result.counts.unknown).toBe(0);
    expect(suggestRecoveryQueue(result)).toHaveLength(0);
  });

  it("will not treat a cause of present with UNKNOWN state as saved", () => {
    const wrong = { ...cell("alpha", "present"), state: "unknown" as const };
    const result = assessOfflineRegion(manifest, inventory([wrong]));
    expect(required(result.rows[0]).offlineStatus).toBe("UNKNOWN");
  });

  it("stops classification if source metadata conflicts with listing", () => {
    const bad = { ...cell("alpha", "present"), provenance: second };
    const result = assessOfflineRegion(manifest, inventory([bad]));
    expect(required(result.rows[0])).toMatchObject({
      kind: "metadata-changed", advice: "review-source", offlineStatus: "UNKNOWN",
    });
    expect(result.status).toBe("UNKNOWN");
  });

  it("does not count an unlisted saved cell as present", () => {
    const outside = { ...cell("alpha", "present"), id: "outside" };
    const result = assessOfflineRegion(manifest, inventory([outside]));
    expect(result.counts.unlisted).toBe(1);
    expect(result.rows.at(-1)).toMatchObject({
      id: "outside", kind: "unlisted", expectedBytes: null, offlineStatus: "UNKNOWN",
    });
  });

  it("does not conflate sources that have different dates", () => {
    const altered: RegionManifest = {
      ...manifest, cells: [
        required(manifest.cells[0]),
        { ...required(manifest.cells[1]), provenance: { ...first, date: "2026-03-03" } },
      ],
    };
    const result = assessOfflineRegion(altered, inventory([]));
    const groups = assessSources(result);
    expect(groups).toHaveLength(2);
    expect(required(groups[0]).source.date).toBe("2026-03-02");
    expect(required(groups[1]).source.date).toBe("2026-03-03");
  });

  it("counts each source with matching and UNKNOWN subsets", () => {
    const groups = assessSources(example());
    expect(groups).toHaveLength(2);
    expect(required(groups[0])).toMatchObject({
      count: 2, saved: 1, unknown: 1, expectedBytes: 30,
    });
    expect(required(groups[1])).toMatchObject({
      count: 2, saved: 0, unknown: 2, expectedBytes: 70,
    });
  });

  it("suggests recovery only with sufficient local evidence", () => {
    const result = assessOfflineRegion(manifest, inventory([
      cell("alpha", "present"), cell("beta", "missing"),
      cell("gamma", "stale"), cell("delta", "present"),
    ]));
    expect(suggestRecoveryQueue(result)).toEqual([
      { id: "beta", bytes: 20, source: first, cause: "missing" },
      { id: "gamma", bytes: 30, source: second, cause: "stale" },
    ]);
  });

  it("keeps unreadable cells out of the automatic recovery suggestion", () => {
    expect(suggestRecoveryQueue(example())).toEqual([]);
  });

  it("filters saved records by exact observed evidence", () => {
    const rows = reviewAssessment(example(), {
      filter: "saved", search: "", order: "manifest", offset: 0, limit: 12,
    });
    expect(rows.rows.map((row) => row.id)).toEqual(["alpha"]);
  });

  it("filters UNKNOWN cells without changing their status", () => {
    const rows = reviewAssessment(example(), {
      filter: "unknown", search: "", order: "manifest", offset: 0, limit: 12,
    });
    expect(rows.rows.map((row) => row.id)).toEqual(["beta", "gamma", "delta"]);
    expect(rows.rows.every((row) => row.offlineStatus === "UNKNOWN")).toBe(true);
  });

  it("filters missing and stale as download candidates", () => {
    const rows = reviewAssessment(example(), {
      filter: "needs-download", search: "", order: "manifest", offset: 0, limit: 12,
    });
    expect(rows.rows.map((row) => row.id)).toEqual(["beta", "gamma"]);
  });

  it("can find a cell by exact source, licence and date", () => {
    for (const search of ["Municipal", "CC0 1.0", "2026-02-01"]) {
      const page = reviewAssessment(example(), {
        filter: "all", search, order: "manifest", offset: 0, limit: 12,
      });
      expect(page.rows.map((row) => row.id)).toEqual(["gamma", "delta"]);
    }
  });

  it("searches without case sensitivity", () => {
    const page = reviewAssessment(example(), {
      filter: "all", search: "  ONTARIO  ", order: "manifest", offset: 0, limit: 12,
    });
    expect(page.total).toBe(2);
  });

  it("sorts by listed size ascending and descending", () => {
    for (const [order, expected] of [
      ["size-asc", ["alpha", "beta", "gamma", "delta"]],
      ["size-desc", ["delta", "gamma", "beta", "alpha"]],
    ] as const) {
      const page = reviewAssessment(example(), {
        filter: "all", search: "", order, offset: 0, limit: 12,
      });
      expect(page.rows.map((row) => row.id)).toEqual(expected);
    }
  });

  it("sorts by ID and by offline state deterministically", () => {
    for (const order of ["id", "status"] as ReviewOrder[]) {
      const a = reviewAssessment(example(), { filter: "all", search: "", order, offset: 0, limit: 12 });
      const b = reviewAssessment(example(), { filter: "all", search: "", order, offset: 0, limit: 12 });
      expect(a).toEqual(b);
    }
  });

  it("paginates without losing records", () => {
    const seen: string[] = [];
    for (let offset = 0; offset < 4; offset += 1) {
      const page = reviewAssessment(example(), {
        filter: "all", search: "", order: "manifest", offset, limit: 1,
      });
      expect(page.rows).toHaveLength(1);
      seen.push(required(page.rows[0]).id);
      expect(page.hasPrevious).toBe(offset > 0);
      expect(page.hasNext).toBe(offset < 3);
    }
    expect(seen).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("caps page size and normalizes invalid offsets", () => {
    const page = reviewAssessment(example(), {
      filter: "all", search: "", order: "manifest", offset: -100, limit: 99999,
    });
    expect(page.limit).toBe(100);
    expect(page.offset).toBe(0);
    expect(page.total).toBe(4);
  });

  it("uses zero-cost suggestions without claiming storage success", () => {
    const outcome = assessRecoveryBudget([], { quota: 2_000_000, usage: 0 });
    expect(outcome).toMatchObject({ queueBytes: 0, fitsEstimate: "yes", reason: "enough" });
  });

  it("treats absent quota data as UNKNOWN", () => {
    const queue = [{ id: "alpha", bytes: 10, source: first, cause: "missing" as const }];
    expect(assessRecoveryBudget(queue, {}).fitsEstimate).toBe("UNKNOWN");
    expect(assessRecoveryBudget(queue, { quota: 5, usage: 9 }).reason).toBe("unknown-estimate");
  });

  it("accounts for the reserved margin", () => {
    const queue = [{ id: "alpha", bytes: 10, source: first, cause: "missing" as const }];
    expect(assessRecoveryBudget(queue, { quota: 1_048_586, usage: 0 }).fitsEstimate).toBe("yes");
    expect(assessRecoveryBudget(queue, { quota: 1_048_585, usage: 0 }).fitsEstimate).toBe("no");
  });

  it("rejects negative or non-integral queued bytes", () => {
    for (const bytes of [-1, Number.NaN, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
      const queue = [{ id: "alpha", bytes, source: first, cause: "missing" as const }];
      expect(assessRecoveryBudget(queue, { quota: 10_000_000, usage: 0 }).fitsEstimate).toBe("UNKNOWN");
    }
  });

  it("never merges queue estimates into the offline statuses", () => {
    const initial = example();
    assessRecoveryBudget([], { quota: 5_000_000, usage: 0 });
    expect(required(initial.rows[1]).offlineStatus).toBe("UNKNOWN");
  });

  it("supports all public filters without silently excluding records", () => {
    const filters: ReviewFilter[] = ["all", "saved", "unknown", "needs-download", "source"];
    for (const filter of filters) {
      const result = reviewAssessment(example(), {
        filter, search: "", order: "manifest", offset: 0, limit: 12,
      });
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.rows.every((row) => example().rows.some((source) => source.id === row.id))).toBe(true);
    }
  });
});
