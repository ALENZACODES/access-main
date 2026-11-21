import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import {
  comparePackManifests, exportImpactJson, exportImpactText, pagePackChanges, parseManifest,
  safeRegionFilename, validateManifest, validSourceDate, type ChangePageOptions,
} from "./packChangeImpact";
const provenance = { source: "Ontario open data", licence: "Open Government Licence", date: "2026-10-01" };
const a = { id: "entrance", bytes: 100, provenance };
const b = { id: "washroom", bytes: 300, provenance: { ...provenance, date: "2026-11-01" } };
const c = { id: "transfer", bytes: 150, provenance };
const current: RegionManifest = { regionId: "ontario-sample", cells: [a, b, c] };
const local: RegionInventory = { regionId: current.regionId, cells: [a, b, c].map((cell) => ({
  id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
  state: "saved" as const, cause: "present" as const,
})), savedCount: 3, unknownCount: 0, savedBytes: 550, expectedBytes: 550, complete: true };
const additional = { id: "pickup", bytes: 200, provenance: { ...provenance, source: "Transit provider", date: "2026-11-02" } };
const updated: RegionManifest = { regionId: current.regionId, cells: [
  { ...a, bytes: 120, provenance: { ...a.provenance, date: "2026-11-10" } },
  { ...b, provenance: { ...b.provenance, licence: "Open Data Licence" } },
  additional,
] };
const compare = (second: RegionManifest = updated, inventory: RegionInventory | null = local) =>
  comparePackManifests(current, second, inventory);
const page = (opts: Partial<ChangePageOptions> = {}) => pagePackChanges(compare(),
  { search: "", filter: "all", sort: "listed", offset: 0, limit: 15, ...opts });
describe("pack change validation", () => {
  it("accepts a minimal region", () => { expect(validateManifest({ regionId: "sample", cells: [] }).cells).toHaveLength(0); });
  it("keeps each exact source", () => { expect(validateManifest(current).cells[0]?.provenance).toEqual(provenance); });
  it("does not mutate the source input", () => { const before = JSON.stringify(current); validateManifest(current); expect(JSON.stringify(current)).toBe(before); });
  it("rejects unexpected top-level property", () => { expect(() => validateManifest({ ...current, physicalAccess: "yes" })).toThrow(); });
  it("rejects unsupported cell property", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, latitude: 45 }] })).toThrow(); });
  it("rejects unsupported source property", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, provenance: { ...provenance, verified: true } }] })).toThrow(); });
  it("rejects duplicate cell IDs", () => { expect(() => validateManifest({ regionId: "r", cells: [a, a] })).toThrow(); });
  it("rejects a blank ID", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, id: "" }] })).toThrow(); });
  it("rejects leading and trailing whitespace", () => { expect(() => validateManifest({ regionId: " r ", cells: [] })).toThrow(); });
  it("rejects negative bytes", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, bytes: -3 }] })).toThrow(); });
  it("rejects fractional bytes", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, bytes: 1.1 }] })).toThrow(); });
  it("rejects unsafe integers", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, bytes: Number.MAX_SAFE_INTEGER + 1 }] })).toThrow(); });
  it("accepts zero-byte metadata", () => { expect(validateManifest({ regionId: "r", cells: [{ ...a, bytes: 0 }] }).cells[0]?.bytes).toBe(0); });
  it("rejects blank source", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, provenance: { ...provenance, source: "" } }] })).toThrow(); });
  it("rejects blank licence", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, provenance: { ...provenance, licence: "" } }] })).toThrow(); });
  it("rejects malformed source date", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, provenance: { ...provenance, date: "yesterday" } }] })).toThrow(); });
  it("accepts valid leap day", () => { expect(validSourceDate("2024-02-29")).toBe(true); });
  it("rejects invalid leap day", () => { expect(validSourceDate("2025-02-29")).toBe(false); });
  it("rejects impossible calendar day", () => { expect(validSourceDate("2026-11-31")).toBe(false); });
  it("rejects slash date", () => { expect(validSourceDate("2026/11/20")).toBe(false); });
  it("rejects bidi override in labels", () => { expect(() => validateManifest({ regionId: "r", cells: [{ ...a, id: "bad\u202evalue" }] })).toThrow(); });
  it("rejects too many cells", () => { expect(() => validateManifest({ regionId: "r", cells: Array.from({ length: 1025 }, (_, i) => ({ ...a, id: `i${i}` })) })).toThrow(); });
  it("parses valid JSON", () => { expect(parseManifest(JSON.stringify(current))).toEqual(current); });
  it("rejects invalid JSON", () => { expect(() => parseManifest("{")) .toThrow(); });
  it("rejects oversized JSON", () => { expect(() => parseManifest("x".repeat(131073))).toThrow(); });
  it("rejects JSON containing a false physical claim", () => { expect(() => parseManifest(JSON.stringify({ ...current, accessible: true }))).toThrow(); });
  it("rejects non-object JSON", () => { expect(() => parseManifest("null")).toThrow(); });
});
describe("pack change impact and inventory uncertainty", () => {
  it("keeps physical conditions UNKNOWN", () => { expect(compare().physicalAccess).toBe("UNKNOWN"); });
  it("is ready only for matching region identifiers", () => { expect(compare().status).toBe("ready"); });
  it("labels a changed region UNKNOWN", () => { expect(compare({ ...updated, regionId: "other" }).status).toBe("UNKNOWN"); });
  it("does not infer local copies for a different region", () => { expect(compare({ ...updated, regionId: "other" }).locallySaved).toBe(0); });
  it("lists missing inventory UNKNOWN", () => { expect(compare(updated, null).localUnknown).toBe(4); });
  it("lists newly added pickup only once", () => { expect(compare().rows.filter((row) => row.kind === "added").map((row) => row.id)).toEqual(["pickup"]); });
  it("lists a removed transfer cell", () => { expect(compare().rows.filter((row) => row.kind === "removed").map((row) => row.id)).toEqual(["transfer"]); });
  it("retains stable record order", () => { expect(compare().rows.map((row) => row.id)).toEqual(["entrance", "washroom", "transfer", "pickup"]); });
  it("retains two separate changes on the entrance", () => { expect(compare().rows[0]?.changes).toEqual(["date", "bytes"]); });
  it("shows changed licence on washroom", () => { expect(compare().rows[1]?.changes).toEqual(["licence"]); });
  it("counts all modified old cells", () => { expect(compare().modified).toBe(2); });
  it("counts one newly listed cell", () => { expect(compare().added).toBe(1); });
  it("counts one removed cell", () => { expect(compare().removed).toBe(1); });
  it("does not invent unchanged status", () => { expect(compare().unchanged).toBe(0); });
  it("calculates previous byte total", () => { expect(compare().totalBeforeBytes).toBe(550); });
  it("calculates new byte total", () => { expect(compare().totalAfterBytes).toBe(620); });
  it("calculates difference from the listings only", () => { expect(compare().deltaBytes).toBe(70); });
  it("retains old metadata on a deleted cell", () => { expect(compare().rows[2]?.after).toBeNull(); expect(compare().rows[2]?.before?.id).toBe("transfer"); });
  it("retains new metadata on an added cell", () => { expect(compare().rows[3]?.before).toBeNull(); expect(compare().rows[3]?.after?.id).toBe("pickup"); });
  it("reports exact saved copy for unmodified source metadata", () => { expect(compare().rows[0]?.localCopy).toBe("saved"); });
  it("does not claim a new added copy is saved", () => { expect(compare().rows[3]?.localCopy).toBe("UNKNOWN"); });
  it("reports a stale copy UNKNOWN", () => { const other = { ...local, cells: local.cells.map((cell) => cell.id === "entrance" ? { ...cell, cause: "stale" as const, state: "unknown" as const } : cell) }; expect(compare(updated, other).rows[0]?.localCopy).toBe("UNKNOWN"); });
  it("reports a mismatched licence UNKNOWN", () => { const other = { ...local, cells: local.cells.map((cell) => cell.id === "entrance" ? { ...cell, provenance: { ...provenance, licence: "Other" } } : cell) }; expect(compare(updated, other).rows[0]?.localCopy).toBe("UNKNOWN"); });
  it("reports an unreadable copy UNKNOWN", () => { const other = { ...local, cells: local.cells.map((cell) => cell.id === "entrance" ? { ...cell, cause: "unreadable" as const, state: "unknown" as const } : cell) }; expect(compare(updated, other).rows[0]?.localReason).toBe("unreadable"); });
  it("reports inventory region mismatch UNKNOWN", () => { expect(compare(updated, { ...local, regionId: "different" }).locallySaved).toBe(0); });
  it("reports inventory duplicates as conflict", () => { const other = { ...local, cells: [...local.cells, local.cells[0]!] }; expect(compare(updated, other).rows[0]?.localReason).toBe("inventory-conflict"); });
  it("reports inventory bytes mismatch UNKNOWN", () => { const other = { ...local, cells: local.cells.map((cell) => cell.id === "entrance" ? { ...cell, expectedBytes: 999 } : cell) }; expect(compare(updated, other).rows[0]?.localCopy).toBe("UNKNOWN"); });
  it("does not mutate original manifest", () => { const before = JSON.stringify(current); compare(); expect(JSON.stringify(current)).toBe(before); });
  it("does not mutate proposed manifest", () => { const before = JSON.stringify(updated); compare(); expect(JSON.stringify(updated)).toBe(before); });
  it("does not mutate local inventory", () => { const before = JSON.stringify(local); compare(); expect(JSON.stringify(local)).toBe(before); });
  it("prioritizes removed data", () => { expect(compare().rows[2]?.priority).toBe("review-first"); });
  it("keeps a follow-up question for changes", () => { expect(compare().rows[1]?.question).toContain("licence"); });
  it("leaves unchanged copies with no-change priority", () => { expect(compare(current).rows[0]?.priority).toBe("no-change"); });
  it("treats unchanged copies without inventory as review first", () => { expect(compare(current, null).rows[0]?.priority).toBe("review-first"); });
});
describe("pack change paging and reporting", () => {
  it("shows all rows", () => { expect(page().total).toBe(4); });
  it("finds a cell case-insensitively", () => { expect(page({ search: "WASHROOM" }).rows.map((row) => row.id)).toEqual(["washroom"]); });
  it("finds a source case-insensitively", () => { expect(page({ search: "transit provider" }).rows.map((row) => row.id)).toEqual(["pickup"]); });
  it("filters added", () => { expect(page({ filter: "added" }).rows.map((row) => row.id)).toEqual(["pickup"]); });
  it("filters source dates", () => { expect(page({ filter: "date" }).rows.map((row) => row.id)).toEqual(["entrance"]); });
  it("filters changed", () => { expect(page({ filter: "changed" }).total).toBe(4); });
  it("filters saved local copies", () => { expect(page({ filter: "saved" }).total).toBe(3); });
  it("filters UNKNOWN copies", () => { expect(page({ filter: "UNKNOWN" }).total).toBe(1); });
  it("sorts largest first", () => { expect(page({ sort: "largest" }).rows[0]?.id).toBe("washroom"); });
  it("sorts ID alphabetically", () => { expect(page({ sort: "id" }).rows[0]?.id).toBe("entrance"); });
  it("sorts priority deterministically", () => { expect(page({ sort: "priority" }).rows[0]?.priority).toBe("review-first"); });
  it("shows next-page flag", () => { expect(page({ limit: 1 }).next).toBe(true); });
  it("shows previous-page flag", () => { expect(page({ limit: 1, offset: 1 }).previous).toBe(true); });
  it("rejects invalid page size", () => { expect(() => page({ limit: 0 })).toThrow(); });
  it("rejects offset below zero", () => { expect(() => page({ offset: -1 })).toThrow(); });
  it("rejects excess page size", () => { expect(() => page({ limit: 101 })).toThrow(); });
  it("rejects oversized search", () => { expect(() => page({ search: "x".repeat(161) })).toThrow(); });
  it("serializes deterministic JSON", () => { const a = exportImpactJson(compare(), "2026-11-20"); expect(a).toBe(exportImpactJson(compare(), "2026-11-20")); });
  it("uses a schema and explicit report date", () => { expect(JSON.parse(exportImpactJson(compare(), "2026-11-20")).date).toBe("2026-11-20"); });
  it("ends JSON with newline", () => { expect(exportImpactJson(compare(), "2026-11-20").endsWith("\n")).toBe(true); });
  it("rejects impossible report date", () => { expect(() => exportImpactJson(compare(), "2026-02-30")).toThrow(); });
  it("retains source licence in JSON", () => { expect(exportImpactJson(compare(), "2026-11-20")).toContain("Open Government Licence"); });
  it("keeps physical unknown in JSON", () => { expect(JSON.parse(exportImpactJson(compare(), "2026-11-20")).physicalAccess).toBe("UNKNOWN"); });
  it("does not include cell payloads", () => { expect(exportImpactJson(compare(), "2026-11-20")).not.toContain("Uint8Array"); });
  it("provides English text", () => { expect(exportImpactText(compare(), "en")).toContain("Offline pack change impact"); });
  it("provides French text", () => { expect(exportImpactText(compare(), "fr")).toContain("Incidence des changements du pack hors ligne"); });
  it("uses French nonbreaking colon", () => { expect(exportImpactText(compare(), "fr")).toContain("Région\u00a0:"); });
  it("uses UNKNOWN in French", () => { expect(exportImpactText(compare(), "fr")).toContain("UNKNOWN"); });
  it("uses path-safe filenames", () => { expect(safeRegionFilename("../north/west", "json")).toBe("offline-pack-change-north-west.json"); });
  it("has a fallback name", () => { expect(safeRegionFilename("", "txt")).toBe("offline-pack-change-region.txt"); });
  it("caps filename length", () => { expect(safeRegionFilename("x".repeat(500), "txt").length).toBeLessThan(90); });
});
