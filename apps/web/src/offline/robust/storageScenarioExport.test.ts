import { describe, expect, it } from "vitest";
import type { RegionManifest, Provenance } from "./regionDownload.ts";
import type { RegionInventory } from "./regionInventory.ts";
import { planStorageScenario } from "./storageScenario.ts";
import {
  createScenarioReport, dateIsReal, encodeScenarioReport,
  formatScenarioReport, safeScenarioText, scenarioFilename,
} from "./storageScenarioExport.ts";

const source: Provenance = { source: "Public municipal records", licence: "CC BY 4.0", date: "2026-01-01" };
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "a", bytes: 100, provenance: source },
    { id: "b", bytes: 200, provenance: source },
  ],
};
const inventory: RegionInventory = {
  regionId: "north",
  cells: [
    { id: "a", expectedBytes: 100, state: "saved", cause: "present", provenance: source },
    { id: "b", expectedBytes: 200, state: "unknown", cause: "missing", provenance: source },
  ],
  savedCount: 1, unknownCount: 1, savedBytes: 100, expectedBytes: 300, complete: false,
};
function report() {
  const plan = planStorageScenario({
    manifest, inventory, estimate: { quota: 2_000_000, usage: 0 },
    reserveBytes: 1_048_576, overheadBytes: 100, maxBatchCells: 10,
  });
  return createScenarioReport(plan, "2026-11-19");
}

describe("storage scenario device-local export", () => {
  it("includes a versioned metadata-only schema", () => {
    const result = report();
    expect(result.schema).toBe("offline-storage-scenario-v1");
    expect(result.regionId).toBe("north");
    expect(result.reportDate).toBe("2026-11-19");
  });

  it("does not export local pack contents", () => {
    const result = encodeScenarioReport(report());
    expect(result).not.toContain("Uint8Array");
    expect(result).not.toContain("data:application");
    expect(result).not.toContain("base64");
    expect(result).not.toContain("Blob");
  });

  it("includes source, open licence and source date", () => {
    const result = report();
    expect(result.cells[0]?.source).toEqual(source);
    expect(result.cells[1]?.source?.licence).toBe("CC BY 4.0");
    expect(result.cells[1]?.source?.date).toBe("2026-01-01");
  });

  it("does not infer a documentation tier", () => {
    const result = report();
    expect(result.cells.every((cell) => cell.sourceTier === "UNKNOWN")).toBe(true);
  });

  it("records estimated sizes without claiming reserved storage", () => {
    const result = report();
    expect(result.summary.totalPlannedBytes).toBe(300);
    expect(result.summary.reserveBytes).toBe(1_048_576);
    expect(result.groups[0]?.bytes).toBe(300);
  });

  it("retains the difference between saved and proposed", () => {
    const result = report();
    expect(result.cells[0]?.status).toBe("saved");
    expect(result.cells[1]?.status).toBe("candidate");
  });

  it("produces deterministic formatted JSON", () => {
    const first = encodeScenarioReport(report());
    const second = encodeScenarioReport(report());
    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(JSON.parse(first)).toMatchObject({ schema: "offline-storage-scenario-v1" });
  });

  it("produces an English plain-text alternative", () => {
    const content = formatScenarioReport(report(), "en");
    expect(content).toContain("Storage planning scenarios");
    expect(content).toContain("Source: Public municipal records");
    expect(content).toContain("Licence: CC BY 4.0");
    expect(content).toContain("Source date: 2026-01-01");
    expect(content).toContain("UNKNOWN");
  });

  it("produces a French text alternative with correct colon spacing", () => {
    const content = formatScenarioReport(report(), "fr");
    expect(content).toContain("Scénarios de planification du stockage");
    expect(content).toContain("Source\u00a0: Public municipal records");
    expect(content).toContain("Licence\u00a0: CC BY 4.0");
    expect(content).toContain("Date de la source\u00a0: 2026-01-01");
  });

  it("sanitizes line breaks and bidi overrides in text", () => {
    expect(safeScenarioText("text\u202eother\nnext")).toBe("text other next");
    expect(safeScenarioText("a\r\nb")).toBe("a  b");
  });

  it("uses safe, bounded filenames", () => {
    expect(scenarioFilename("../A/B C", "2026-11-19", "json"))
      .toBe("offline-storage-a-b-c-2026-11-19.json");
    expect(scenarioFilename("A".repeat(1000), "2026-11-19", "txt").length)
      .toBeLessThan(100);
    expect(scenarioFilename("", "2026-11-19", "json"))
      .toBe("offline-storage-region-2026-11-19.json");
  });

  it("does not allow paths in report dates", () => {
    expect(scenarioFilename("north", "../../escape", "json"))
      .toBe("offline-storage-north-unknown-date.json");
  });

  it("rejects impossible calendar dates", () => {
    const invalid = ["2026-02-30", "2026-13-01", "2026-2-1", "", "2026-11-19\nnext"];
    for (const date of invalid) {
      expect(dateIsReal(date)).toBe(false);
      expect(() => createScenarioReport(planStorageScenario({
        manifest, inventory, estimate: {}, reserveBytes: 0,
        overheadBytes: 0, maxBatchCells: 10,
      }), date)).toThrow();
    }
  });

  it("permits a leap-year February 29", () => {
    expect(dateIsReal("2024-02-29")).toBe(true);
    expect(dateIsReal("2025-02-29")).toBe(false);
  });

  it("does not export query terms or browser identifiers", () => {
    const json = encodeScenarioReport(report());
    expect(json).not.toContain("userAgent");
    expect(json).not.toContain("localStorage");
    expect(json).not.toContain("browserId");
  });
});
