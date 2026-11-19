import { describe, expect, it } from "vitest";
import type { RegionInventory } from "./regionInventory";
import type { RegionManifest } from "./regionDownload";
import { planRecoveryBatches } from "./recoveryBatches";
import {
  buildRecoveryExport, encodeRecoveryExport, formatRecoveryExport,
  recoveryExportFilename,
} from "./recoveryBatchesExport";
import {
  RECOVERY_COPY, auditRecoveryCopy, recoveryBudgetText,
  recoveryCopy, recoveryReasonText, recoveryStateText,
} from "./recoveryBatchesCopy";

const provenance = { source: "Ontario public information", licence: "CC BY 4.0", date: "2026-01-12" };
const manifest: RegionManifest = {
  regionId: "region-1",
  cells: [
    { id: "first", bytes: 8, provenance },
    { id: "second", bytes: 16, provenance },
  ],
};
const inventory: RegionInventory = {
  regionId: "region-1",
  cells: [
    { id: "first", expectedBytes: 8, state: "saved", cause: "present", provenance },
    { id: "second", expectedBytes: 16, state: "unknown", cause: "missing", provenance },
  ],
  savedCount: 1, unknownCount: 1, savedBytes: 8, expectedBytes: 24, complete: false,
};

function report() {
  return buildRecoveryExport(planRecoveryBatches(manifest, inventory, {
    quota: 2_000_000, usage: 0,
  }));
}

describe("bilingual offline recovery exports", () => {
  it("uses stable versioned metadata-only JSON", () => {
    const result = report();
    expect(result.schema).toBe("offline-recovery-batches-v1");
    expect(result.rows).toHaveLength(2);
    const text = encodeRecoveryExport(result);
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toMatchObject({ regionId: "region-1", state: "ready" });
    expect(text).not.toContain("Uint8Array");
    expect(text).not.toContain("base64");
    expect(text).not.toContain("data:application");
  });

  it("never serializes browser storage or personal device identifiers", () => {
    const result = report();
    const text = encodeRecoveryExport(result);
    expect(text).not.toContain("localStorage");
    expect(text).not.toContain("navigator");
    expect(text).not.toContain("userAgent");
    expect(result.rows[0]?.sourceTier).toBe("UNKNOWN");
    expect(result.rows[1]?.sourceTier).toBe("UNKNOWN");
  });

  it("retains exact source, licence and date in the export", () => {
    const result = report();
    expect(result.rows[1]).toMatchObject({
      offlineStatus: "UNKNOWN", reason: "missing", source: provenance.source,
      licence: provenance.licence, sourceDate: provenance.date, expectedBytes: 16,
    });
    expect(result.batches[0]).toMatchObject({
      ids: ["second"], bytes: 16, source: provenance.source,
      licence: provenance.licence, sourceDate: provenance.date,
    });
  });

  it("reports missing inventory without inventing provenance observations", () => {
    const result = buildRecoveryExport(planRecoveryBatches(manifest, null, {}));
    expect(result.state).toBe("UNKNOWN");
    expect(result.batches).toHaveLength(0);
    expect(result.rows.every((row) => row.offlineStatus === "UNKNOWN")).toBe(true);
    expect(result.rows.every((row) => row.source === null)).toBe(true);
    expect(result.totalBytes).toBeNull();
  });

  it("renders English plain text with the literal UNKNOWN token", () => {
    const text = formatRecoveryExport(report(), "en");
    expect(text).toContain("Offline recovery batches");
    expect(text).toContain("UNKNOWN cells: 1");
    expect(text).toContain("Source: Ontario public information");
    expect(text).toContain("Licence: CC BY 4.0");
    expect(text).toContain("Data date: 2026-01-12");
    expect(text).toContain("Source tier: UNKNOWN");
  });

  it("renders French nonbreaking colon spacing and literal UNKNOWN", () => {
    const text = formatRecoveryExport(report(), "fr");
    expect(text).toContain("Lots de récupération hors ligne");
    expect(text).toContain("Cellules UNKNOWN\u00a0: 1");
    expect(text).toContain("Source\u00a0: Ontario public information");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
    expect(text).toContain("Date des données\u00a0: 2026-01-12");
    expect(text).toContain("Niveau de source\u00a0: UNKNOWN");
  });

  it("removes control characters from plain-text user-controlled identifiers", () => {
    const altered = { ...report(), rows: [{
      ...report().rows[0]!, id: "safe\u202eunsafe\nnext",
    }] };
    const text = formatRecoveryExport(altered, "en");
    expect(text).not.toContain("\u202e");
    expect(text).toContain("safe unsafe next");
  });

  it("prints UNKNOWN for missing byte counts and source metadata", () => {
    const result = buildRecoveryExport(planRecoveryBatches(manifest, null, {}));
    const text = formatRecoveryExport(result, "fr");
    expect(text).toContain("Octets répertoriés\u00a0: UNKNOWN");
    expect(text).toContain("Source\u00a0: UNKNOWN");
  });

  it("produces stable safe file names", () => {
    expect(recoveryExportFilename("North/../../East", "json"))
      .toBe("offline-recovery-north-east.json");
    expect(recoveryExportFilename("", "txt")).toBe("offline-recovery-region.txt");
    expect(recoveryExportFilename("a".repeat(200), "txt").length).toBeLessThan(100);
  });

  it("keeps both language catalogues structurally equal", () => {
    expect(Object.keys(RECOVERY_COPY.fr)).toEqual(Object.keys(RECOVERY_COPY.en));
    expect(recoveryCopy("en").unknown).toBe("UNKNOWN");
    expect(recoveryCopy("fr").unknown).toBe("UNKNOWN");
    expect(auditRecoveryCopy()).toEqual([]);
  });

  it("expresses storage uncertainty without making a write promise", () => {
    expect(recoveryBudgetText("UNKNOWN", "en")).toContain("UNKNOWN");
    expect(recoveryBudgetText("UNKNOWN", "fr")).toContain("UNKNOWN");
    expect(recoveryBudgetText("fits", "en")).toContain("Estimated");
    expect(recoveryBudgetText("insufficient", "fr")).toContain("insuffisant");
  });

  it("expresses listing state in both languages", () => {
    for (const language of ["en", "fr"] as const) {
      expect(recoveryStateText("UNKNOWN", language).length).toBeGreaterThan(0);
      expect(recoveryStateText("no-action", language).length).toBeGreaterThan(0);
      expect(recoveryStateText("ready", language).length).toBeGreaterThan(0);
    }
  });

  it("keeps distinct reasons available to readers in both languages", () => {
    for (const language of ["en", "fr"] as const) {
      for (const reason of [
        "missing", "stale", "unreadable", "metadata-conflict", "invalid-listing",
        "inventory-unavailable", "not-inspected", "duplicate", "unlisted", "saved",
      ] as const) {
        expect(recoveryReasonText(reason, language).length).toBeGreaterThan(0);
      }
    }
  });
});
