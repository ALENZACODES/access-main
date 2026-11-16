import { describe, expect, it } from "vitest";
import {
  createLocalReport,
  encodeLocalReport,
  formatLocalReport,
  reportFilename,
  type LocalReportInput,
} from "./localReport";
import { auditManifest } from "./manifestAudit";
import { type RegionManifest } from "./regionDownload";
import { type RegionInventory } from "./regionInventory";
import { type CapacityPlan } from "./quotaPlanning";

const date = "2026-11-15";
const provenance = {
  source: "City open information",
  licence: "CC BY 4.0",
  date: "2026-03-02",
};
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "north-1", bytes: 20, provenance },
    { id: "north-2", bytes: 30, provenance },
  ],
};
const audit = auditManifest(manifest, date);
const inventory: RegionInventory = {
  regionId: "north",
  savedCount: 1,
  unknownCount: 1,
  savedBytes: 20,
  expectedBytes: 50,
  complete: false,
  cells: [
    { id: "north-1", expectedBytes: 20, state: "saved", cause: "present", provenance },
    { id: "north-2", expectedBytes: 30, state: "unknown", cause: "missing", provenance },
  ],
};
const plan: CapacityPlan = {
  status: "sufficient",
  requiredBytes: 1_048_606,
  remainingBytes: 30,
  freeBytes: 2_000_000,
  reserveBytes: 1_048_576,
  percentage: 50,
  missingCount: 1,
};
function input(overrides: Partial<LocalReportInput> = {}): LocalReportInput {
  return {
    regionId: manifest.regionId,
    inventory,
    plan,
    result: null,
    audit,
    date,
    ...overrides,
  };
}

describe("local device-only offline report", () => {
  it("reports a partial region without hiding UNKNOWN cells", () => {
    const report = createLocalReport(input());
    expect(report.schema).toBe("offline-report-v1");
    expect(report.status).toBe("partial");
    expect(report.saved).toBe(1);
    expect(report.unknown).toBe(1);
    expect(report.expected).toBe(2);
    expect(report.remainingBytes).toBe(30);
    expect(report.estimatedFreeBytes).toBe(2_000_000);
    expect(report.manifestReady).toBe(true);
  });

  it("retains only metadata and never serializes raw cell bytes", () => {
    const report = createLocalReport(input());
    const json = encodeLocalReport(report);
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toMatchObject({
      region: "north", status: "partial", saved: 1, unknown: 1,
    });
    expect(json).not.toContain("Uint8Array");
    expect(json).not.toContain("data:application");
    expect(json).not.toContain("base64");
    expect(json.endsWith("\n")).toBe(true);
  });

  it("exposes source, licence, and date for each cell", () => {
    const report = createLocalReport(input());
    expect(report.cells).toEqual([
      {
        id: "north-1", offlineStatus: "saved", cause: "present",
        expectedBytes: 20, source: provenance.source,
        licence: provenance.licence, date: provenance.date,
      },
      {
        id: "north-2", offlineStatus: "unknown", cause: "missing",
        expectedBytes: 30, source: provenance.source,
        licence: provenance.licence, date: provenance.date,
      },
    ]);
  });

  it("uses UNKNOWN rather than completion when inventory is unreadable", () => {
    const report = createLocalReport(input({ inventory: null, plan: null }));
    expect(report.status).toBe("unknown");
    expect(report.unknown).toBe(manifest.cells.length);
    expect(report.saved).toBe(0);
    expect(report.estimatedFreeBytes).toBeNull();
    expect(report.remainingBytes).toBeNull();
    expect(report.cells).toEqual([]);
  });

  it("only marks completion when inventory and manifest are both sound", () => {
    const complete: RegionInventory = {
      ...inventory,
      savedCount: 2,
      unknownCount: 0,
      complete: true,
      cells: inventory.cells.map((cell) => ({
        ...cell, state: "saved" as const, cause: "present" as const,
      })),
    };
    expect(createLocalReport(input({ inventory: complete })).status).toBe("complete");
    const rejectedAudit = auditManifest({
      ...manifest,
      cells: manifest.cells.map((cell) => ({
        ...cell, provenance: { ...provenance, licence: "Private" },
      })),
    }, date);
    expect(createLocalReport(input({
      inventory: complete, audit: rejectedAudit,
    })).status).toBe("partial");
  });

  it("retains the last stop reason as context, not a completion assertion", () => {
    const report = createLocalReport(input({
      result: {
        regionId: "north",
        available: ["north-1"], missing: ["north-2"],
        completed: false, reason: "quota",
      },
    }));
    expect(report.lastStop).toBe("quota");
    expect(report.status).toBe("partial");
  });

  it("provides English plain text with explicit UNKNOWN", () => {
    const text = formatLocalReport(createLocalReport(input()), "en");
    expect(text).toContain("Offline region report");
    expect(text).toContain("UNKNOWN cells: 1");
    expect(text).toContain("Status: UNKNOWN");
    expect(text).toContain("Source: City open information");
    expect(text).toContain("Licence: CC BY 4.0");
    expect(text).toContain("Date: 2026-03-02");
  });

  it("provides French plain text with a nonbreaking space before colon", () => {
    const text = formatLocalReport(createLocalReport(input()), "fr");
    expect(text).toContain("Rapport de région hors ligne");
    expect(text).toContain("Cellules INCONNUES\u00a0: 1");
    expect(text).toContain("État\u00a0: INCONNU");
    expect(text).toContain("Source\u00a0: City open information");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
    expect(text).toContain("Date\u00a0: 2026-03-02");
  });

  it("sanitizes directional overrides and line breaks in report text", () => {
    const source = "Safe\u202eNot safe\nnext";
    const altered: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => ({
        ...cell, provenance: { ...provenance, source },
      })),
    };
    const report = createLocalReport(input({ inventory: altered }));
    const text = formatLocalReport(report, "en");
    expect(text).not.toContain("\u202e");
    expect(text).toContain("Safe Not safe next");
  });

  it("formats unknown capacity without pretending an estimate exists", () => {
    const unknown: CapacityPlan = { ...plan, freeBytes: null, status: "unknown" };
    const report = createLocalReport(input({ plan: unknown }));
    expect(formatLocalReport(report, "en")).toContain("Estimated free storage: UNKNOWN");
    expect(formatLocalReport(report, "fr")).toContain("Stockage libre estimé\u00a0: INCONNU");
  });

  it("creates safe filenames for a region with path-like punctuation", () => {
    expect(reportFilename("a/../../B C", date, "json")).toBe(
      "offline-a-b-c-2026-11-15.json",
    );
    expect(reportFilename("", date, "txt")).toBe(
      "offline-region-2026-11-15.txt",
    );
  });

  it("limits filename size and strips control characters", () => {
    const filename = reportFilename("A".repeat(300), date, "txt");
    expect(filename.length).toBeLessThan(100);
    expect(filename).toMatch(/^offline-a+-2026-11-15\.txt$/);
  });

  it("does not accept arbitrary date fragments in filenames", () => {
    expect(reportFilename("north", "../../escape", "json")).toBe(
      "offline-north-unknown-date.json",
    );
  });
});
