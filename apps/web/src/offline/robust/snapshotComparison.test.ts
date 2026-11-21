import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { assertSnapshot, compareSnapshots, encodeSnapshot, fromRegionManifest, pageSnapshotMatrix,
  parseSnapshot, snapshotDate, MAX_SNAPSHOT_BYTES, type SnapshotDocument, type SnapshotFilter, type SnapshotOrder } from "./snapshotComparison";

const provenance = { source: "Ontario open data", licence: "Open Government Licence", date: "2026-10-01" };
const manifest: RegionManifest = { regionId: "ontario-test", cells: [
  { id: "entrance", bytes: 100, provenance },
  { id: "lift", bytes: 200, provenance },
  { id: "washroom", bytes: 300, provenance },
] };
const base = fromRegionManifest(manifest, "2026-11-20");
const copy = (changes: Partial<SnapshotDocument> = {}): SnapshotDocument => ({ ...base, ...changes });
const cell = (id: string, bytes: number, source = provenance) => ({ id, bytes, provenance: source });
const inventory: RegionInventory = { regionId: "ontario-test", cells: manifest.cells.map((entry) => ({
  id: entry.id, state: "saved" as const, cause: "present" as const,
  expectedBytes: entry.bytes, provenance: entry.provenance,
})), savedCount: 3, unknownCount: 0, savedBytes: 600, expectedBytes: 600, complete: true };
const initial = () => compareSnapshots(base, base, base, inventory);

describe("three-way local source comparison", () => {
  it("produces an exact three-row matching baseline", () => {
    const result = initial();
    expect(result.rows.map((row) => row.cellId)).toEqual(["entrance", "lift", "washroom"]);
    expect(result.rows.every((row) => row.optionA.kind === "same" && row.optionB.kind === "same")).toBe(true);
    expect(result.reviewCount).toBe(0);
    expect(result.physicalAccess).toBe("UNKNOWN");
  });
  it("does not treat saved local bytes as physical accessibility", () => {
    expect(initial().rows.every((row) => row.localState === "saved" && row.physicalAccess === "UNKNOWN")).toBe(true);
  });
  it("distinguishes missing comparison from an empty comparison", () => {
    const absent = compareSnapshots(base, null, null, inventory);
    const empty = compareSnapshots(base, copy({ cells: [] }), null, inventory);
    expect(absent.status).toBe("UNKNOWN");
    expect(absent.rows[0]?.optionA.kind).toBe("missing-snapshot");
    expect(empty.rows[0]?.optionA.kind).toBe("removed");
  });
  it("preserves a new cell on just one side", () => {
    const next = copy({ cells: [...base.cells, cell("arrival", 400)] });
    const matrix = compareSnapshots(base, next, base, inventory);
    const row = matrix.rows.find((item) => item.cellId === "arrival");
    expect(row?.optionA.kind).toBe("added");
    expect(row?.optionB.kind).toBe("added");
    expect(row?.localState).toBe("UNKNOWN");
  });
  it("classifies removal rather than no change", () => {
    const result = compareSnapshots(base, copy({ cells: [base.cells[0]!] }), base, inventory);
    expect(result.rows.find((row) => row.cellId === "lift")?.optionA.kind).toBe("removed");
    expect(result.optionAChanged).toBe(2);
  });
  it("compares source name independently of sizes", () => {
    const result = compareSnapshots(base, copy({ cells: [cell("entrance", 100, { ...provenance, source: "Another publisher" }), ...base.cells.slice(1)] }), base, inventory);
    expect(result.rows[0]?.optionA.kind).toBe("metadata");
    expect(result.rows[0]?.optionA.sourceChanged).toBe(true);
    expect(result.rows[0]?.optionA.bytesChanged).toBe(false);
  });
  it("compares licence without inventing access conditions", () => {
    const result = compareSnapshots(base, copy({ cells: [cell("entrance", 100, { ...provenance, licence: "CC BY 4.0" }), ...base.cells.slice(1)] }), base, inventory);
    expect(result.rows[0]?.optionA.licenceChanged).toBe(true);
    expect(result.rows[0]?.physicalAccess).toBe("UNKNOWN");
  });
  it("compares source date from metadata", () => {
    const result = compareSnapshots(base, copy({ cells: [cell("entrance", 100, { ...provenance, date: "2026-10-02" }), ...base.cells.slice(1)] }), base, inventory);
    expect(result.rows[0]?.optionA.dateChanged).toBe(true);
  });
  it("changes declared sizes without claiming a successful download", () => {
    const result = compareSnapshots(base, copy({ cells: [cell("entrance", 500), ...base.cells.slice(1)] }), base, inventory);
    expect(result.rows[0]?.optionA.kind).toBe("bytes");
    expect(result.rows[0]?.optionA.bytesChanged).toBe(true);
    expect(result.optionABytes).toBe(1000);
  });
  it("does not count absent options as zero-sized data", () => {
    const result = compareSnapshots(base, null, null, inventory);
    expect(result.optionABytes).toBeNull();
    expect(result.optionBBytes).toBeNull();
  });
  it("does not mutate inputs during sorting or comparison", () => {
    const before = JSON.stringify([base, inventory]);
    compareSnapshots(base, base, base, inventory);
    expect(JSON.stringify([base, inventory])).toBe(before);
  });
  it("rejects comparisons for different region identifiers", () => {
    expect(() => compareSnapshots(base, copy({ regionId: "different" }), null, inventory)).toThrow();
  });
  it("handles no listed cells", () => {
    const empty = copy({ cells: [] });
    expect(compareSnapshots(empty, empty, null).rows).toHaveLength(0);
  });
  it("does not claim current local data with no inventory", () => {
    expect(compareSnapshots(base, base, null).localUnknown).toBe(3);
  });
  it("does not claim local data when region identifiers disagree", () => {
    expect(compareSnapshots(base, base, null, { ...inventory, regionId: "elsewhere" }).localSaved).toBe(0);
  });
  it("does not claim local copy when inventory reports stale", () => {
    const other = { ...inventory, cells: inventory.cells.map((x) => x.id === "lift" ? { ...x, cause: "stale" as const } : x) };
    expect(compareSnapshots(base, base, null, other).rows[1]?.localState).toBe("UNKNOWN");
  });
  it("does not claim a copy when provenance differs", () => {
    const other = { ...inventory, cells: inventory.cells.map((x) => x.id === "lift" ? { ...x, provenance: { ...provenance, date: "2026-09-01" } } : x) };
    expect(compareSnapshots(base, base, null, other).rows[1]?.localReason).toBe("source-or-copy-mismatch");
  });
  it("does not claim a copy when expected size differs", () => {
    const other = { ...inventory, cells: inventory.cells.map((x) => x.id === "lift" ? { ...x, expectedBytes: 201 } : x) };
    expect(compareSnapshots(base, base, null, other).rows[1]?.localState).toBe("UNKNOWN");
  });
  it("rejects duplicate manifest cells", () => {
    expect(() => assertSnapshot({ ...base, cells: [base.cells[0], base.cells[0]] })).toThrow();
  });
  it("rejects unknown source keys", () => {
    expect(() => assertSnapshot({ ...base, cells: [{ ...base.cells[0], provenance: { ...provenance, tier: "certified" } }] })).toThrow();
  });
  it("rejects future source dates relative to snapshot", () => {
    expect(() => assertSnapshot({ ...base, takenOn: "2026-09-01" })).toThrow();
  });
  it("rejects invalid access status embedded in snapshot", () => {
    expect(() => assertSnapshot({ ...base, accessibility: "accessible" })).toThrow();
  });
  it("rejects unexpected browser identifiers", () => {
    expect(() => assertSnapshot({ ...base, userAgent: "private" })).toThrow();
  });
  it("rejects malformed JSON and oversized JSON", () => {
    expect(() => parseSnapshot("{" )).toThrow();
    expect(() => parseSnapshot(" ".repeat(MAX_SNAPSHOT_BYTES + 1))).toThrow();
  });
  it("roundtrips deterministic snapshots", () => {
    expect(parseSnapshot(encodeSnapshot(base))).toEqual(base);
    expect(encodeSnapshot(base)).toBe(encodeSnapshot(base));
  });
  it("uses a final newline for saved JSON", () => expect(encodeSnapshot(base).endsWith("\n")).toBe(true));
  it("filters by source metadata changes", () => {
    const a = copy({ cells: [cell("entrance", 100, { ...provenance, licence: "CC BY" }), ...base.cells.slice(1)] });
    const m = compareSnapshots(base, a, base, inventory);
    expect(pageSnapshotMatrix(m, { search: "", filter: "metadata", order: "listed", offset: 0, limit: 10 }).rows.map((x) => x.cellId)).toEqual(["entrance"]);
  });
  it("does not mutate matrix rows during alternate ordering", () => {
    const m = initial();
    const before = m.rows.map((row) => row.cellId);
    pageSnapshotMatrix(m, { search: "", filter: "all", order: "cell", offset: 0, limit: 2 });
    expect(m.rows.map((row) => row.cellId)).toEqual(before);
  });
  it("returns a correct pagination boundary", () => {
    const m = initial();
    expect(pageSnapshotMatrix(m, { search: "", filter: "all", order: "listed", offset: 0, limit: 2 }).next).toBe(true);
    expect(pageSnapshotMatrix(m, { search: "", filter: "all", order: "listed", offset: 2, limit: 2 }).previous).toBe(true);
  });
  it("rejects invalid page lengths and sorting", () => {
    const m = initial();
    expect(() => pageSnapshotMatrix(m, { search: "", filter: "all", order: "listed", offset: 0, limit: 0 })).toThrow();
    expect(() => pageSnapshotMatrix(m, { search: "", filter: "all", order: "listed", offset: -1, limit: 1 })).toThrow();
  });
  it("keeps case-insensitive cell search", () => {
    expect(pageSnapshotMatrix(initial(), { search: "LIFT", filter: "all", order: "listed", offset: 0, limit: 5 }).total).toBe(1);
  });
  for (const value of ["2024-02-29", "2026-01-01", "2026-12-31"]) {
    it(`accepts a valid calendar date ${value}`, () => expect(snapshotDate(value)).toBe(true));
  }
  for (const value of ["2025-02-29", "2026-13-01", "2026-00-01", "2026-11-31", "2026/11/20", "", "not-a-date"]) {
    it(`rejects an invalid calendar date ${value}`, () => expect(snapshotDate(value)).toBe(false));
  }
  for (const value of ["all", "changed", "UNKNOWN", "saved", "same", "added", "removed", "metadata", "bytes", "missing-snapshot"] as SnapshotFilter[]) {
    it(`supports the ${value} cell filter`, () => {
      const m = initial();
      expect(pageSnapshotMatrix(m, { search: "", filter: value, order: "listed", offset: 0, limit: 10 }).total >= 0).toBe(true);
    });
  }
  for (const value of ["listed", "cell", "largest-change", "uncertainty"] as SnapshotOrder[]) {
    it(`supports the ${value} sort`, () => {
      expect(pageSnapshotMatrix(initial(), { search: "", filter: "all", order: value, offset: 0, limit: 10 }).total).toBe(3);
    });
  }
});
