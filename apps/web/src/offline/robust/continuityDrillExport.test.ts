import { describe, expect, it } from "vitest";
import type { Provenance, RegionManifest } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import { runContinuityDrill } from "./continuityDrill";
import {
  createContinuityReport, encodeContinuityReport, formatContinuityReport,
  continuityFilename, type ContinuityReport,
} from "./continuityDrillExport";

const provenance: Provenance = {
  source: "Municipal open data", licence: "CC BY 4.0", date: "2026-01-02",
};
const manifest: RegionManifest = {
  regionId: "central", cells: [
    { id: "cell-one", bytes: 100, provenance },
    { id: "cell-two", bytes: 200, provenance },
  ],
};
const cells: InventoryCell[] = [
  { id: "cell-one", cause: "present", state: "saved", expectedBytes: 100, provenance },
  { id: "cell-two", cause: "missing", state: "unknown", expectedBytes: 200, provenance },
];
const inventory: RegionInventory = {
  regionId: "central", cells, savedCount: 1, unknownCount: 1,
  savedBytes: 100, expectedBytes: 300, complete: false,
};
const result = runContinuityDrill(manifest, inventory);
function report(date = "2026-11-19"): ContinuityReport {
  return createContinuityReport(result, date);
}

describe("continuity metadata report", () => {
  it("uses an explicitly versioned schema", () => {
    expect(report().schema).toBe("offline-continuity-report-v1");
  });
  it("uses the supplied date rather than current clock time", () => {
    expect(report("2024-02-29").date).toBe("2024-02-29");
  });
  it("keeps the region ID", () => {
    expect(report().region).toBe("central");
  });
  it("keeps the selected scenario", () => {
    expect(report().scenario).toBe("baseline");
  });
  it("keeps the UNKNOWN state", () => {
    expect(report().state).toBe("partial");
    expect(report().cells[1]?.after).toBe("UNKNOWN");
  });
  it("retains missing local copies without inventing source tier", () => {
    expect(report().cells[1]?.tier).toBe("UNKNOWN");
  });
  it("does not embed downloaded cell payloads", () => {
    const json = encodeContinuityReport(report());
    expect(json).not.toContain("Uint8Array");
    expect(json).not.toContain("data:application");
    expect(json).not.toContain("base64");
  });
  it("includes exact source metadata", () => {
    expect(report().cells[0]?.source).toEqual(provenance);
  });
  it("includes source licence", () => {
    expect(encodeContinuityReport(report())).toContain("CC BY 4.0");
  });
  it("includes source publication date", () => {
    expect(encodeContinuityReport(report())).toContain("2026-01-02");
  });
  it("includes listed expected bytes", () => {
    expect(report().cells.map((item) => item.listedBytes)).toEqual([100, 200]);
  });
  it("includes the expected counts", () => {
    expect(report().totals.listed).toBe(2);
    expect(report().totals.beforeSaved).toBe(1);
    expect(report().totals.afterUnknown).toBe(1);
  });
  it("retains metadata-only quota estimate", () => {
    expect(report().capacity.freeBytes).toBeNull();
  });
  it("maintains stable cell order", () => {
    expect(report().cells.every((item) => Object.keys(item).includes("id"))).toBe(true);
  });
  it("provides stable order using the cell id", () => {
    expect(report().cells.map((item) => item.id)).toEqual(["cell-one", "cell-two"]);
  });
  it("serializes deterministic JSON on repeated calls", () => {
    expect(encodeContinuityReport(report())).toBe(encodeContinuityReport(report()));
  });
  it("appends a final newline to JSON", () => {
    expect(encodeContinuityReport(report()).endsWith("\n")).toBe(true);
  });
  it("creates parseable JSON", () => {
    const parsed: unknown = JSON.parse(encodeContinuityReport(report()));
    expect(parsed).toMatchObject({ region: "central", date: "2026-11-19" });
  });
  it("does not mutate the original drill", () => {
    const before = JSON.stringify(result);
    createContinuityReport(result, "2026-11-19");
    expect(JSON.stringify(result)).toBe(before);
  });
  it("rejects an empty date", () => {
    expect(() => report("")).toThrow();
  });
  it("rejects a date with slash separators", () => {
    expect(() => report("2026/11/19")).toThrow();
  });
  it("rejects an impossible month", () => {
    expect(() => report("2026-13-19")).toThrow();
  });
  it("rejects an impossible day", () => {
    expect(() => report("2026-02-30")).toThrow();
  });
  it("rejects a newline injection in the date", () => {
    expect(() => report("2026-11-19\nsecond")).toThrow();
  });
  it("allows leap day in a leap year", () => {
    expect(report("2024-02-29").date).toBe("2024-02-29");
  });
  it("rejects leap day outside a leap year", () => {
    expect(() => report("2025-02-29")).toThrow();
  });
  it("shows English report title", () => {
    expect(formatContinuityReport(report(), "en")).toContain("Offline continuity drill");
  });
  it("shows French report title", () => {
    expect(formatContinuityReport(report(), "fr")).toContain("Exercice de continuité hors ligne");
  });
  it("shows UNKNOWN without guessing device availability", () => {
    expect(formatContinuityReport(report(), "en")).toContain("After: UNKNOWN");
  });
  it("uses a nonbreaking space before French colons", () => {
    expect(formatContinuityReport(report(), "fr")).toContain("Après\u00a0: UNKNOWN");
  });
  it("includes French licence label", () => {
    expect(formatContinuityReport(report(), "fr")).toContain("Licence\u00a0: CC BY 4.0");
  });
  it("includes English licence label", () => {
    expect(formatContinuityReport(report(), "en")).toContain("Licence: CC BY 4.0");
  });
  it("includes source name in English text", () => {
    expect(formatContinuityReport(report(), "en")).toContain("Source: Municipal open data");
  });
  it("includes source name in French text", () => {
    expect(formatContinuityReport(report(), "fr")).toContain("Source\u00a0: Municipal open data");
  });
  it("includes exact source date", () => {
    expect(formatContinuityReport(report(), "en")).toContain("Source date: 2026-01-02");
  });
  it("preserves UNKNOWN tier labels", () => {
    expect(formatContinuityReport(report(), "fr")).toContain("Niveau de source\u00a0: UNKNOWN");
  });
  it("does not accidentally imply an actual download", () => {
    expect(formatContinuityReport(report(), "en")).toContain("planning exercise");
  });
  it("reports the estimated free storage honestly", () => {
    expect(formatContinuityReport(report(), "en")).toContain("Estimated free storage: UNKNOWN");
  });
  it("does not include any user-specific browser identifiers", () => {
    expect(encodeContinuityReport(report())).not.toContain("userAgent");
  });
  it("does not include latitude", () => {
    expect(encodeContinuityReport(report())).not.toContain("latitude");
  });
  it("does not include longitude", () => {
    expect(encodeContinuityReport(report())).not.toContain("longitude");
  });
  it("renders the reason in a human-readable form", () => {
    expect(formatContinuityReport(report(), "en")).toContain("Reason: Not downloaded");
  });
  it("renders a French human-readable missing reason", () => {
    expect(formatContinuityReport(report(), "fr")).toContain("Raison\u00a0: Non téléchargée");
  });
  it("returns a predictable filename", () => {
    expect(continuityFilename("central", "2026-11-19", "json"))
      .toBe("offline-continuity-central-2026-11-19.json");
  });
  it("replaces path separators in filenames", () => {
    expect(continuityFilename("../North/West", "2026-11-19", "txt"))
      .toBe("offline-continuity-north-west-2026-11-19.txt");
  });
  it("limits filename length", () => {
    expect(continuityFilename("A".repeat(500), "2026-11-19", "json").length).toBeLessThan(110);
  });
  it("falls back for an empty region name", () => {
    expect(continuityFilename("", "2026-11-19", "json")).toContain("region");
  });
  it("falls back for invalid filename date", () => {
    expect(continuityFilename("central", "yesterday", "txt")).toContain("unknown-date");
  });
  it("retains the JSON extension", () => {
    expect(continuityFilename("central", "2026-11-19", "json")).toMatch(/\.json$/);
  });
  it("retains the text extension", () => {
    expect(continuityFilename("central", "2026-11-19", "txt")).toMatch(/\.txt$/);
  });
  it("does not make source-derived assertions on absent inventory", () => {
    const unknown = runContinuityDrill(manifest, null);
    const local = createContinuityReport(unknown, "2026-11-19");
    expect(local.state).toBe("UNKNOWN");
    expect(local.cells.every((item) => item.after === "UNKNOWN")).toBe(true);
  });
  it("sanitizes directional override characters in plain text", () => {
    const altered = { ...report(), cells: [
      { ...report().cells[0]!, source: { ...provenance, source: "Safe\u202eaway\nnext" } },
    ] };
    const text = formatContinuityReport(altered, "en");
    expect(text).not.toContain("\u202e");
    expect(text).toContain("Safe away next");
  });
  it("does not remove source metadata from valid JSON", () => {
    expect(encodeContinuityReport(report())).toContain("Municipal open data");
  });
  it("preserves reason tokens in JSON", () => {
    expect(encodeContinuityReport(report())).toContain("missing");
  });
  it("encodes unknown tiers without inventing a rank", () => {
    expect(report().cells.every((item) => item.tier === "UNKNOWN")).toBe(true);
  });
  it("reports unaffected copies as unaffected", () => {
    expect(report().cells.every((item) => !item.affected)).toBe(true);
  });
});
