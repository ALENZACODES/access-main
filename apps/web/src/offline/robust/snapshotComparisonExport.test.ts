import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import { compareSnapshots, fromRegionManifest } from "./snapshotComparison";
import { createSnapshotReport, encodeSnapshotReport, formatSnapshotReport, snapshotFilename } from "./snapshotComparisonExport";
const manifest: RegionManifest = { regionId: "Ontario / demo", cells: [
  { id: "a", bytes: 50, provenance: { source: "Public source", licence: "OGL", date: "2026-10-01" } },
] };
const first = fromRegionManifest(manifest, "2026-11-20");
const report = () => createSnapshotReport(compareSnapshots(first, first, null));
describe("metadata-only three-way report", () => {
  it("keeps a fixed schema", () => expect(report().schema).toBe("offline-snapshot-comparison-report-v1"));
  it("keeps physical UNKNOWN", () => expect(report().physicalAccess).toBe("UNKNOWN"));
  it("keeps absent option sizes null", () => expect(report().optionBBytes).toBeNull());
  it("exports JSON with a trailing newline", () => expect(encodeSnapshotReport(report()).endsWith("\n")).toBe(true));
  it("exports parseable JSON", () => expect(JSON.parse(encodeSnapshotReport(report())).regionId).toBe("Ontario / demo"));
  it("includes source licence", () => expect(encodeSnapshotReport(report())).toContain("OGL"));
  it("does not include cell bytes", () => expect(encodeSnapshotReport(report())).not.toContain("Uint8Array"));
  it("uses a French nonbreaking colon", () => expect(formatSnapshotReport(report(), "fr")).toContain("\u00a0:"));
  it("uses English title", () => expect(formatSnapshotReport(report(), "en")).toContain("Compare local region listings"));
  it("makes a sanitized filename", () => expect(snapshotFilename("../North / East", "json")).toBe("offline-snapshot-comparison-north-east.json"));
  it("preserves text extension", () => expect(snapshotFilename("ontario", "txt")).toMatch(/\.txt$/));
  it("does not include latitude or browser identifiers", () => {
    expect(encodeSnapshotReport(report())).not.toContain("latitude");
    expect(encodeSnapshotReport(report())).not.toContain("userAgent");
  });
});
