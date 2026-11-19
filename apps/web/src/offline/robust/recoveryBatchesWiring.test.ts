import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("./", import.meta.url);
const source = (name: string): string => readFileSync(new URL(name, root), "utf8");

/** Fail-on-violation tests: a module without a mount is a regression. */
describe("offline recovery batch integration", () => {
  it("exports each new public module from the existing barrel", () => {
    const barrel = source("index.ts");
    for (const name of [
      "recoveryBatches", "recoveryBatchesCopy", "recoveryBatchesExport", "recoveryBatchesPanel",
    ]) expect(barrel).toContain(`export * from "./${name}";`);
  });

  it("mounts recovery batches on the live offline dashboard", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain('import { mountOfflineRecoveryBatches } from "./recoveryBatchesPanel";');
    expect(dashboard).toContain("const unmountRecovery = mountOfflineRecoveryBatches(");
    expect(dashboard).toContain("unmountRecovery();");
  });

  it("preserves existing P12 mounts and cleanup", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const [mount, cleanup] of [
      ["mountOfflineTriage", "unmountTriage"],
      ["mountOfflineCleanup", "unmountCleanup"],
      ["mountOfflineUpdateReview", "unmountReview"],
      ["mountOfflineSessionComparison", "unmountComparison"],
      ["mountOfflineSourceLedger", "unmountLedger"],
      ["mountOfflineTransferChecklist", "unmountChecklist"],
      ["mountStorageDurability", "unmountDurability"],
      ["mountOfflineReadiness", "unmountReadiness"],
      ["mountOfflineDiagnostics", "unmountDiagnostics"],
    ]) {
      expect(dashboard).toContain(mount);
      expect(dashboard).toContain(`${cleanup}();`);
    }
  });

  it("does not replace the existing pack helper exports", () => {
    const barrel = source("index.ts");
    expect(barrel).toContain("createPackCellStore");
    expect(barrel).toContain("regionManifestFor");
    expect(barrel).toContain('export * from "./sourceLedger";');
    expect(barrel).toContain('export * from "./offlineDiagnosticsPanel";');
  });

  it("connects the existing manual download method", () => {
    const panel = source("recoveryBatchesPanel.ts");
    expect(panel).toContain("model.downloadSelected(allowed)");
    expect(panel).toContain("selectedRecoveryBatch(reviewed, batchId, fingerprint)");
    expect(panel).toContain("await model.refresh()");
  });

  it("keeps the source, open licence, date and UNKNOWN documentation tier", () => {
    const plan = source("recoveryBatches.ts");
    const report = source("recoveryBatchesExport.ts");
    expect(plan).toContain("OPEN_LICENCES");
    expect(plan).toContain('type SourceTier = "UNKNOWN"');
    expect(report).toContain('sourceTier: "UNKNOWN"');
  });
});
