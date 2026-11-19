import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Guards against a complete-file handoff replacing earlier panel wiring. */
const barrel = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./offlineDashboard.ts", import.meta.url), "utf8");

const panels = [
  { source: "sourceLedger", copy: "sourceLedgerCopy", panel: "sourceLedgerPanel", mount: "mountOfflineSourceLedger", cleanup: "unmountLedger" },
  { source: "transferChecklist", copy: "transferChecklistCopy", panel: "transferChecklistPanel", mount: "mountOfflineTransferChecklist", cleanup: "unmountChecklist" },
  { source: "storageDurability", copy: null, panel: "storageDurabilityPanel", mount: "mountStorageDurability", cleanup: "unmountDurability" },
  { source: "readinessReview", copy: "readinessCopy", panel: "readinessPanel", mount: "mountOfflineReadiness", cleanup: "unmountReadiness" },
  { source: "offlineDiagnostics", copy: "offlineDiagnosticsCopy", panel: "offlineDiagnosticsPanel", mount: "mountOfflineDiagnostics", cleanup: "unmountDiagnostics" },
] as const;

describe("P12 dashboard integration does not displace earlier panels", () => {
  for (const entry of panels) {
    it(`exports ${entry.panel} and its data module`, () => {
      expect(barrel).toContain(`export * from "./${entry.source}"`);
      expect(barrel).toContain(`export * from "./${entry.panel}"`);
      if (entry.copy !== null) expect(barrel).toContain(`export * from "./${entry.copy}"`);
    });

    it(`mounts and disposes ${entry.mount}`, () => {
      expect(dashboard).toContain(`import { ${entry.mount} } from "./${entry.panel}"`);
      expect(dashboard).toContain(`${entry.mount}(`);
      expect(dashboard).toContain(`${entry.cleanup}()`);
    });
  }

  it("retains the original region pack controls and cleanup", () => {
    for (const name of [
      "mountOfflineTriage", "mountOfflineCleanup", "mountOfflineUpdateReview", "mountOfflineSessionComparison",
    ]) {
      expect(dashboard).toContain(`${name}(`);
    }
    for (const name of ["unmountTriage", "unmountCleanup", "unmountReview", "unmountComparison"]) {
      expect(dashboard).toContain(`${name}()`);
    }
    expect(barrel).toContain('export * from "./regionDownload"');
    expect(barrel).toContain('export * from "./sessionComparisonPanel"');
  });

  it("does not use localized text to replace the unknown-status token", () => {
    expect(dashboard).toContain('"UNKNOWN"');
    for (const file of ["sourceLedgerCopy.ts", "transferChecklistCopy.ts", "readinessCopy.ts", "offlineDiagnosticsCopy.ts"]) {
      const content = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(content).toContain("UNKNOWN");
    }
  });
});
