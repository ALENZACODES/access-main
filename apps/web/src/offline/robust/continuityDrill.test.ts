import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { DEFAULT_DRILL_SETTINGS, pageContinuityDrill, runContinuityDrill } from "./continuityDrill";
import { CONTINUITY_COPY } from "./continuityDrillCopy";
import { createContinuityReport } from "./continuityDrillExport";
const source = { source: "Ontario", licence: "Open Government Licence", date: "2026-11-01" };
const manifest: RegionManifest = { regionId: "region-1", cells: [
  { id: "a", bytes: 100, provenance: source },
  { id: "b", bytes: 200, provenance: { ...source, date: "2026-10-01" } },
  { id: "c", bytes: 300, provenance: source },
] };
const inventory: RegionInventory = { regionId: "region-1", cells: manifest.cells.map((cell) => ({
  id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
  state: "saved" as const, cause: "present" as const,
})), savedCount: 3, unknownCount: 0, savedBytes: 600, expectedBytes: 600, complete: true };
const run = (scenario: typeof DEFAULT_DRILL_SETTINGS.scenario, count = 1) =>
  runContinuityDrill(manifest, inventory, { ...DEFAULT_DRILL_SETTINGS, scenario, affectedCount: count });
describe("offline continuity local rehearsal", () => {
  it("does not change a baseline", () => {
    const value = run("baseline");
    expect(value.beforeSaved).toBe(3);
    expect(value.afterSaved).toBe(3);
    expect(value.affected).toBe(0);
  });
  it("selects largest local copies first", () => {
    const value = run("evict-largest", 2);
    expect(value.cells.filter((cell) => cell.affected).map((cell) => cell.id)).toEqual(["b", "c"]);
    expect(value.afterSaved).toBe(1);
  });
  it("selects oldest declared source first", () => {
    const value = run("evict-oldest");
    expect(value.cells.filter((cell) => cell.affected).map((cell) => cell.id)).toEqual(["b"]);
  });
  it("treats missing inventory as UNKNOWN", () => {
    const value = runContinuityDrill(manifest, null, DEFAULT_DRILL_SETTINGS);
    expect(value.status).toBe("UNKNOWN");
    expect(value.cells.every((cell) => cell.after === "UNKNOWN")).toBe(true);
  });
  it("does not silently accept source drift", () => {
    const value = runContinuityDrill(manifest, { ...inventory, cells: inventory.cells.map((cell) =>
      cell.id === "a" ? { ...cell, provenance: { ...source, date: "2026-09-01" } } : cell) }, DEFAULT_DRILL_SETTINGS);
    expect(value.status).toBe("UNKNOWN");
    expect(value.cells.find((cell) => cell.id === "a")?.after).toBe("UNKNOWN");
  });
  it("does not convert an unreadable inventory to saved", () => {
    const value = runContinuityDrill(manifest, { ...inventory, cells: inventory.cells.map((cell) =>
      cell.id === "b" ? { ...cell, state: "unknown" as const, cause: "unreadable" as const } : cell) }, DEFAULT_DRILL_SETTINGS);
    expect(value.cells.find((cell) => cell.id === "b")?.after).toBe("UNKNOWN");
  });
  it("does not infer quota reduction without a quota estimate", () => {
    const value = runContinuityDrill(manifest, inventory, { ...DEFAULT_DRILL_SETTINGS, scenario: "quota-reduction", reductionBytes: 200 });
    expect(value.status).toBe("UNKNOWN");
    expect(value.cells.every((cell) => cell.after === "UNKNOWN")).toBe(true);
  });
  it("can model reduced capacity with a supplied storage estimate", () => {
    const value = runContinuityDrill(manifest, inventory, { ...DEFAULT_DRILL_SETTINGS,
      scenario: "quota-reduction", reductionBytes: 500 }, { quota: 1000, usage: 800 });
    expect(value.affected).toBe(1);
    expect(value.afterSaved).toBe(2);
  });
  it("rejects negative counts", () => {
    expect(() => runContinuityDrill(manifest, inventory, { ...DEFAULT_DRILL_SETTINGS, affectedCount: -1 })).toThrow();
  });
  it("rejects duplicate IDs", () => {
    expect(() => runContinuityDrill({ ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] }, inventory, DEFAULT_DRILL_SETTINGS)).toThrow();
  });
  it("pages and filters without mutation", () => {
    const value = run("evict-largest", 2);
    expect(pageContinuityDrill(value, { filter: "affected", sort: "listed", search: "", offset: 0, limit: 1 }).total).toBe(2);
    expect(pageContinuityDrill(value, { filter: "all", sort: "bytes-desc", search: "", offset: 0, limit: 1 }).rows[0]?.id).toBe("c");
    expect(value.cells.map((cell) => cell.id)).toEqual(["a", "b", "c"]);
  });
  it("exports metadata without payload", () => {
    const text = createContinuityReport(run("baseline"), "fr");
    expect(JSON.parse(text).tier).toBe("UNKNOWN");
    expect(text).not.toContain("payloadBytes");
  });
  it("keeps translated UNKNOWN in both languages", () => {
    expect(CONTINUITY_COPY.en.unknown).toBe("UNKNOWN");
    expect(CONTINUITY_COPY.fr.unknown).toBe("UNKNOWN");
  });
});
