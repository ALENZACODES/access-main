import { describe, expect, it } from "vitest";
import type { RegionManifest, Provenance } from "./regionDownload";
import type { RegionInventory, InventoryCell } from "./regionInventory";
import { assessReadinessSpace, browseReadiness, createReadinessReview, serializeReadiness } from "./readinessReview";

const source: Provenance = { source: "Ontario open information", licence: "CC BY 4.0", date: "2026-02-01" };
const other: Provenance = { source: "City open information", licence: "CC0 1.0", date: "2026-03-02" };
const manifest: RegionManifest = {
  regionId: "region-a",
  cells: [
    { id: "a", bytes: 4, provenance: source },
    { id: "b", bytes: 6, provenance: source },
    { id: "c", bytes: 8, provenance: other },
    { id: "d", bytes: 10, provenance: other },
  ],
};
function record(id: string, cause: InventoryCell["cause"], override: Partial<InventoryCell> = {}): InventoryCell {
  const expected = manifest.cells.find((entry) => entry.id === id);
  if (!expected) throw new Error("Unknown test fixture");
  return {
    id, state: cause === "present" ? "saved" : "unknown", cause,
    expectedBytes: expected.bytes, provenance: expected.provenance, ...override,
  };
}
function inventory(cells: readonly InventoryCell[]): RegionInventory {
  const saved = cells.filter((cell) => cell.state === "saved");
  return {
    regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((n, cell) => n + cell.expectedBytes, 0),
    expectedBytes: cells.reduce((n, cell) => n + cell.expectedBytes, 0),
    complete: saved.length === cells.length,
  };
}
const mixed = () => inventory([
  record("a", "present"), record("b", "missing"),
  record("c", "stale"), record("d", "unreadable"),
]);

describe("offline readiness review", () => {
  it("preserves saved versus UNKNOWN cells", () => {
    const review = createReadinessReview(manifest, mixed());
    expect(review.status).toBe("UNKNOWN");
    expect(review.rows.map((row) => row.state)).toEqual(["saved", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect(review.totals.saved).toBe(1);
    expect(review.totals.unknown).toBe(3);
  });
  it("counts distinct causes without treating stale copies as current", () => {
    const review = createReadinessReview(manifest, mixed());
    expect(review.totals.missing).toBe(1);
    expect(review.totals.stale).toBe(1);
    expect(review.totals.unreadable).toBe(1);
    expect(review.rows[2]?.nextStep).toBe("download");
    expect(review.rows[3]?.nextStep).toBe("inspect");
  });
  it("keeps source, licence and date without assigning a tier", () => {
    const review = createReadinessReview(manifest, mixed());
    expect(review.rows[0]?.source).toEqual(source);
    expect(review.rows[2]?.source).toEqual(other);
    expect(review.rows.every((row) => row.tier === "UNKNOWN")).toBe(true);
  });
  it("never equates an unreadable record with a missing one", () => {
    const review = createReadinessReview(manifest, mixed());
    expect(review.rows[3]?.reason).toBe("unreadable");
    expect(review.rows[3]?.nextStep).toBe("inspect");
  });
  it("treats an absent inventory conservatively", () => {
    const review = createReadinessReview(manifest, null);
    expect(review.status).toBe("UNKNOWN");
    expect(review.totals.savedBytes).toBeNull();
    expect(review.totals.remainingBytes).toBeNull();
    expect(review.rows.every((row) => row.state === "UNKNOWN")).toBe(true);
  });
  it("requires inventory and manifest region IDs to match", () => {
    const review = createReadinessReview(manifest, { ...mixed(), regionId: "elsewhere" });
    expect(review.findings).toContain("region-mismatch");
    expect(review.totals.saved).toBe(0);
  });
  it("does not trust incomplete inventories", () => {
    const review = createReadinessReview(manifest, inventory([record("a", "present")]));
    expect(review.findings).toContain("inventory-count");
    expect(review.totals.saved).toBe(0);
  });
  it("rejects duplicate manifest IDs", () => {
    const bad: RegionManifest = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] };
    const review = createReadinessReview(bad, inventory([]));
    expect(review.findings).toContain("duplicate-cell:a");
    expect(review.status).toBe("UNKNOWN");
  });
  it("rejects duplicate inventory IDs", () => {
    const rows = mixed().cells;
    const review = createReadinessReview(manifest, inventory([rows[0]!, rows[0]!, rows[2]!, rows[3]!]));
    expect(review.findings).toContain("duplicate-inventory:a");
    expect(review.totals.saved).toBe(0);
  });
  it("rejects invalid dates", () => {
    const bad = { ...manifest, cells: [{ ...manifest.cells[0]!, provenance: { ...source, date: "2026-02-30" } }] };
    expect(createReadinessReview(bad, null).findings).toContain("source:a");
  });
  it("rejects sources without an open licence", () => {
    const bad = { ...manifest, cells: [{ ...manifest.cells[0]!, provenance: { ...source, licence: "Restricted" } }] };
    expect(createReadinessReview(bad, null).findings).toContain("source:a");
  });
  it("rejects source-control characters", () => {
    const bad = { ...manifest, cells: [{ ...manifest.cells[0]!, provenance: { ...source, source: "Bad\nsource" } }] };
    expect(createReadinessReview(bad, null).findings).toContain("source:a");
  });
  it("rejects oversized manifests", () => {
    const review = createReadinessReview(manifest, mixed(), {}, { maxCells: 2 });
    expect(review.findings).toContain("too-many-cells");
  });
  it("rejects unsafe byte counts", () => {
    const bad = { ...manifest, cells: [{ ...manifest.cells[0]!, bytes: -1 }] };
    expect(createReadinessReview(bad, null).findings).toContain("size:a");
  });
  it("treats changed provenance as UNKNOWN", () => {
    const rows = mixed().cells.map((row) => row.id === "a" ? { ...row, provenance: other } : row);
    const review = createReadinessReview(manifest, inventory(rows));
    expect(review.rows[0]?.state).toBe("UNKNOWN");
    expect(review.rows[0]?.reason).toBe("mismatched-metadata");
    expect(review.rows[0]?.nextStep).toBe("review-source");
  });
  it("treats byte-count disagreement as UNKNOWN", () => {
    const rows = mixed().cells.map((row) => row.id === "a" ? { ...row, expectedBytes: 8 } : row);
    const review = createReadinessReview(manifest, inventory(rows));
    expect(review.rows[0]?.reason).toBe("mismatched-metadata");
  });
  it("refuses present cause without saved state", () => {
    const rows = mixed().cells.map((row) => row.id === "a" ? { ...row, state: "unknown" as const } : row);
    expect(createReadinessReview(manifest, inventory(rows)).rows[0]?.state).toBe("UNKNOWN");
  });
  it("completes only when every cell matches", () => {
    const all = inventory(manifest.cells.map((cell) => record(cell.id, "present")));
    const review = createReadinessReview(manifest, all);
    expect(review.status).toBe("complete");
    expect(review.totals.savedBytes).toBe(28);
    expect(review.totals.remainingBytes).toBe(0);
  });
  it("advises no download from an unreadable region", () => {
    const review = createReadinessReview(manifest, null);
    expect(review.rows.every((row) => row.nextStep === "inspect")).toBe(true);
  });
  it("calculates quota as an estimate rather than a result", () => {
    const review = createReadinessReview(manifest, mixed(), { quota: 2_000_000, usage: 0 });
    expect(review.estimate.state).toBe("sufficient");
    expect(review.rows[1]?.state).toBe("UNKNOWN");
  });
  it("treats missing quota as UNKNOWN", () => {
    expect(assessReadinessSpace(100, {}).state).toBe("UNKNOWN");
  });
  it("rejects inconsistent quota numbers", () => {
    for (const estimate of [
      { quota: 10, usage: 20 }, { quota: -1, usage: 0 },
      { quota: Number.NaN, usage: 0 }, { quota: 10.5, usage: 0 },
    ]) expect(assessReadinessSpace(1, estimate).state).toBe("UNKNOWN");
  });
  it("requires the reserved space in capacity estimates", () => {
    expect(assessReadinessSpace(10, { quota: 1_048_585, usage: 0 }).state).toBe("low");
    expect(assessReadinessSpace(10, { quota: 1_048_586, usage: 0 }).state).toBe("sufficient");
  });
  it("rejects negative capacity reserve", () => {
    expect(() => assessReadinessSpace(0, {}, -1)).toThrow();
  });
  it("filters UNKNOWN rows", () => {
    const page = browseReadiness(createReadinessReview(manifest, mixed()), { filter: "unknown" });
    expect(page.rows.map((row) => row.id)).toEqual(["b", "c", "d"]);
  });
  it("filters download suggestions without inferring access", () => {
    const page = browseReadiness(createReadinessReview(manifest, mixed()), { filter: "download" });
    expect(page.rows.map((row) => row.id)).toEqual(["b", "c"]);
    expect(page.rows.every((row) => row.state === "UNKNOWN")).toBe(true);
  });
  it("searches source metadata without changing input", () => {
    const review = createReadinessReview(manifest, mixed());
    const page = browseReadiness(review, { search: "  CITY  " });
    expect(page.rows.map((row) => row.id)).toEqual(["c", "d"]);
    expect(review.rows).toHaveLength(4);
  });
  it("sorts by size and identifier", () => {
    const review = createReadinessReview(manifest, mixed());
    expect(browseReadiness(review, { order: "size-desc" }).rows.map((row) => row.id))
      .toEqual(["d", "c", "b", "a"]);
    expect(browseReadiness(review, { order: "id" }).rows.map((row) => row.id))
      .toEqual(["a", "b", "c", "d"]);
  });
  it("paginates without losing records", () => {
    const review = createReadinessReview(manifest, mixed());
    expect(browseReadiness(review, { limit: 2 }).rows.map((row) => row.id)).toEqual(["a", "b"]);
    const page = browseReadiness(review, { limit: 2, offset: 2 });
    expect(page.rows.map((row) => row.id)).toEqual(["c", "d"]);
    expect(page.hasNext).toBe(false);
  });
  it("caps page size and guards invalid offsets", () => {
    const page = browseReadiness(createReadinessReview(manifest, mixed()), { offset: -1, limit: 500 });
    expect(page.offset).toBe(0);
    expect(page.limit).toBe(50);
  });
  it("serializes only metadata", () => {
    const serialized = serializeReadiness(createReadinessReview(manifest, mixed()));
    const value: unknown = JSON.parse(serialized);
    expect(value).toMatchObject({ schema: "offline-readiness-v1", regionId: "region-a" });
    expect(serialized).not.toContain("Uint8Array");
    expect(serialized).not.toContain("base64");
    expect(serialized.endsWith("\n")).toBe(true);
  });
});
