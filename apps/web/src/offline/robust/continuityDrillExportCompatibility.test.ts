import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { DEFAULT_DRILL_SETTINGS, runContinuityDrill } from "./continuityDrill";
import {
  createContinuityReport, encodeContinuityReport, formatContinuityReport,
  continuityFilename,
} from "./continuityDrillExport";

const provenance = { source: "Ontario catalogue", licence: "CC BY 4.0", date: "2026-11-01" };
const manifest: RegionManifest = {
  regionId: "ontario-test",
  cells: [
    { id: "first", bytes: 40, provenance },
    { id: "second", bytes: 80, provenance },
  ],
};
const inventory: RegionInventory = {
  regionId: "ontario-test",
  cells: [
    { id: "first", state: "saved", cause: "present", expectedBytes: 40, provenance },
    { id: "second", state: "unknown", cause: "missing", expectedBytes: 80, provenance },
  ],
  savedCount: 1, unknownCount: 1, savedBytes: 40, expectedBytes: 120, complete: false,
};
const result = runContinuityDrill(manifest, inventory, DEFAULT_DRILL_SETTINGS);

describe("continuity export compatibility", () => {
  it("preserves the original EN JSON API", () => {
    expect(JSON.parse(createContinuityReport(result, "en"))).toMatchObject({ tier: "UNKNOWN", locale: "en" });
  });
  it("preserves the original FR JSON API", () => {
    expect(JSON.parse(createContinuityReport(result, "fr"))).toMatchObject({ tier: "UNKNOWN", locale: "fr" });
  });
  it("adds explicit dated structured reports", () => {
    const report = createContinuityReport(result, "2026-11-20");
    expect(report).toMatchObject({ region: "ontario-test", date: "2026-11-20", state: "partial" });
    expect(report.cells.map((cell) => cell.tier)).toEqual(["UNKNOWN", "UNKNOWN"]);
  });
  it("retains all source provenance and expected byte counts", () => {
    const report = createContinuityReport(result, "2026-11-20");
    expect(report.cells.map((cell) => cell.source)).toEqual([provenance, provenance]);
    expect(report.cells.map((cell) => cell.listedBytes)).toEqual([40, 80]);
  });
  it("never reports absent inventory as stored data", () => {
    const missing = runContinuityDrill(manifest, null, DEFAULT_DRILL_SETTINGS);
    const report = createContinuityReport(missing, "2026-11-20");
    expect(report.state).toBe("UNKNOWN");
    expect(report.cells.every((cell) => cell.after === "UNKNOWN")).toBe(true);
  });
  it("retains deterministic JSON with final newline", () => {
    const report = createContinuityReport(result, "2026-11-20");
    expect(encodeContinuityReport(report)).toBe(encodeContinuityReport(report));
    expect(encodeContinuityReport(report).endsWith("\n")).toBe(true);
  });
  it("does not put downloaded payloads in the structured report", () => {
    const json = encodeContinuityReport(createContinuityReport(result, "2026-11-20"));
    expect(json).not.toContain("payloadBytes");
    expect(json).not.toContain("base64");
  });
  it("uses French punctuation spacing", () => {
    const report = createContinuityReport(result, "2026-11-20");
    const text = formatContinuityReport(report, "fr");
    expect(text).toContain("Après\u00a0: UNKNOWN");
    expect(text).toContain("Niveau de source\u00a0: UNKNOWN");
  });
  it("sanitizes direction override controls in displayed text", () => {
    const report = createContinuityReport(result, "2026-11-20");
    const changed = { ...report, cells: [{ ...report.cells[0]!, source: { ...provenance, source: "Safe\u202eaway\nnext" } }] };
    const text = formatContinuityReport(changed, "en");
    expect(text).toContain("Safe away next");
    expect(text).not.toContain("\u202e");
  });
  it("rejects impossible and injected report dates", () => {
    for (const date of ["2025-02-29", "2026-13-01", "2026-11-20\nunsafe", ""]) {
      expect(() => createContinuityReport(result, date)).toThrow();
    }
  });
  it("accepts leap day", () => {
    expect(createContinuityReport(result, "2024-02-29").date).toBe("2024-02-29");
  });
  it("sanitizes region names used for filenames", () => {
    expect(continuityFilename("../North/West", "2026-11-20", "txt"))
      .toBe("offline-continuity-north-west-2026-11-20.txt");
  });
  it("bounds filenames and degrades invalid dates conservatively", () => {
    expect(continuityFilename("X".repeat(500), "2026-11-20", "json").length).toBeLessThan(110);
    expect(continuityFilename("", "not-a-date", "txt")).toContain("region-unknown-date");
  });
});
