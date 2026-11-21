import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { runContinuityDrill, DEFAULT_DRILL_SETTINGS } from "./continuityDrill";
import {
  createContinuityReport,
  encodeContinuityReport,
  formatContinuityReport,
  continuityFilename,
  type ContinuityReport,
} from "./continuityDrillExport";

const provenance = { source: "Municipal open data", licence: "CC BY 4.0", date: "2026-01-02" };
const manifest: RegionManifest = {
  regionId: "central",
  cells: [
    { id: "cell-one", bytes: 100, provenance },
    { id: "cell-two", bytes: 200, provenance },
  ],
};
const inventory: RegionInventory = {
  regionId: "central",
  cells: [
    { id: "cell-one", cause: "present", state: "saved", expectedBytes: 100, provenance },
    { id: "cell-two", cause: "missing", state: "unknown", expectedBytes: 200, provenance },
  ],
  savedCount: 1,
  unknownCount: 1,
  savedBytes: 100,
  expectedBytes: 300,
  complete: false,
};
const result = runContinuityDrill(manifest, inventory, DEFAULT_DRILL_SETTINGS);
const report = (date = "2026-11-19"): ContinuityReport => createContinuityReport(result, date);

describe("continuity report schema and limits", () => {
  it("preserves the explicit schema", () => {
    expect(report().schema).toBe("offline-continuity-report-v1");
  });
  it("uses the supplied report date", () => {
    expect(report("2024-02-29").date).toBe("2024-02-29");
  });
  it("includes source metadata without local payloads", () => {
    expect(report().cells[0]?.source).toEqual(provenance);
    expect(report().cells[0]?.listedBytes).toBe(100);
    expect(report().cells[1]?.listedBytes).toBe(200);
  });
  it("keeps the UNKNOWN source tier for both records", () => {
    expect(report().cells.every((cell) => cell.tier === "UNKNOWN")).toBe(true);
  });
  it("distinguishes partial local observations from complete local observations", () => {
    expect(report().state).toBe("partial");
    expect(report().cells[0]?.after).toBe("saved");
    expect(report().cells[1]?.after).toBe("UNKNOWN");
  });
  it("counts listed, saved and missing local copies", () => {
    expect(report().totals).toMatchObject({
      listed: 2, beforeSaved: 1, afterSaved: 1, afterUnknown: 1, affected: 0,
    });
  });
  it("keeps capacity UNKNOWN without a storage estimate", () => {
    expect(report().capacity.freeBytes).toBeNull();
  });
  it("preserves source order", () => {
    expect(report().cells.map((cell) => cell.id)).toEqual(["cell-one", "cell-two"]);
  });
  it("does not mutate the source drill", () => {
    const before = JSON.stringify(result);
    report();
    expect(JSON.stringify(result)).toBe(before);
  });
  it("rejects an empty report date", () => {
    expect(() => report("")).toThrow();
  });
  it("rejects date separators other than hyphens", () => {
    expect(() => report("2026/11/19")).toThrow();
  });
  it("rejects an impossible month or day", () => {
    expect(() => report("2026-13-19")).toThrow();
    expect(() => report("2026-02-30")).toThrow();
  });
  it("rejects injected newlines in the report date", () => {
    expect(() => report("2026-11-19\nnext")).toThrow();
  });
  it("accepts leap day only in leap years", () => {
    expect(report("2024-02-29").date).toBe("2024-02-29");
    expect(() => report("2025-02-29")).toThrow();
  });
  it("keeps a fully unreadable inventory UNKNOWN", () => {
    const missing = runContinuityDrill(manifest, null, DEFAULT_DRILL_SETTINGS);
    const snapshot = createContinuityReport(missing, "2026-11-19");
    expect(snapshot.state).toBe("UNKNOWN");
    expect(snapshot.cells.every((cell) => cell.after === "UNKNOWN")).toBe(true);
  });
});

describe("bilingual export and stable filenames", () => {
  it("serializes deterministic, parseable JSON", () => {
    const json = encodeContinuityReport(report());
    expect(json).toBe(encodeContinuityReport(report()));
    expect(json.endsWith("\n")).toBe(true);
    expect(JSON.parse(json)).toMatchObject({ region: "central", date: "2026-11-19" });
  });
  it("retains the legacy language-based JSON interface", () => {
    const json = createContinuityReport(result, "en");
    expect(JSON.parse(json).tier).toBe("UNKNOWN");
  });
  it("does not include downloaded file data or browser identifiers", () => {
    const json = encodeContinuityReport(report());
    for (const token of ["Uint8Array", "data:application", "base64", "userAgent", "latitude", "longitude"]) {
      expect(json).not.toContain(token);
    }
  });
  it("has an English report title and context", () => {
    const text = formatContinuityReport(report(), "en");
    expect(text).toContain("Offline continuity drill");
    expect(text).toContain("planning exercise");
    expect(text).toContain("Estimated free storage: UNKNOWN");
  });
  it("has a French title and proper nonbreaking colon spacing", () => {
    const text = formatContinuityReport(report(), "fr");
    expect(text).toContain("Exercice de continuité hors ligne");
    expect(text).toContain("Après\u00a0: UNKNOWN");
    expect(text).toContain("Source\u00a0: Municipal open data");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
    expect(text).toContain("Niveau de source\u00a0: UNKNOWN");
  });
  it("preserves source dates and human-readable reasons", () => {
    const english = formatContinuityReport(report(), "en");
    const french = formatContinuityReport(report(), "fr");
    expect(english).toContain("Source date: 2026-01-02");
    expect(english).toContain("Reason: Not downloaded");
    expect(french).toContain("Raison\u00a0: Non téléchargée");
  });
  it("removes direction controls and newlines from displayed source metadata", () => {
    const base = report();
    const first = base.cells[0];
    if (first === undefined) throw new Error("Expected a listed cell");
    const changed: ContinuityReport = {
      ...base,
      cells: [{ ...first, source: { ...first.source, source: "Safe\u202eaway\nnext" } }],
    };
    const text = formatContinuityReport(changed, "en");
    expect(text).not.toContain("\u202e");
    expect(text).toContain("Safe away next");
  });
  it("formats predictable safe filenames", () => {
    expect(continuityFilename("central", "2026-11-19", "json"))
      .toBe("offline-continuity-central-2026-11-19.json");
    expect(continuityFilename("../North/West", "2026-11-19", "txt"))
      .toBe("offline-continuity-north-west-2026-11-19.txt");
  });
  it("bounds filename length and replaces invalid dates", () => {
    expect(continuityFilename("A".repeat(500), "2026-11-19", "json").length).toBeLessThan(110);
    expect(continuityFilename("", "2026-11-19", "json")).toContain("region");
    expect(continuityFilename("central", "yesterday", "txt")).toContain("unknown-date");
  });
});
