import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("./", import.meta.url);
const source = (name: string): string => readFileSync(new URL(name, root), "utf8");

/** Guard the live route integration without invoking browser network APIs. */
describe("offline recovery guide live wiring", () => {
  it("exports the pure planner and its explicit request guard", () => {
    expect(source("index.ts")).toContain('export * from "./recoveryGuide";');
  });

  it("exports the English and French copy", () => {
    expect(source("index.ts")).toContain('export * from "./recoveryGuideCopy";');
  });

  it("exports the metadata-only local report", () => {
    expect(source("index.ts")).toContain('export * from "./recoveryGuideExport";');
  });

  it("exports the mounted recovery guide", () => {
    expect(source("index.ts")).toContain('export * from "./recoveryGuidePanel";');
  });

  it("imports the recovery guide through the live dashboard", () => {
    expect(source("offlineDashboard.ts"))
      .toContain('import { mountOfflineRecoveryGuide } from "./recoveryGuidePanel";');
  });

  it("mounts the recovery guide with a capacity estimator", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain("const unmountGuide = mountOfflineRecoveryGuide(");
    expect(dashboard).toContain("dependencies.estimateStorage");
  });

  it("cleans up the recovery guide when the dashboard unmounts", () => {
    expect(source("offlineDashboard.ts")).toContain("unmountGuide();");
  });

  it("does not displace the existing recovery batch panel", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain("mountOfflineRecoveryBatches");
    expect(dashboard).toContain("unmountRecovery();");
  });

  it("does not displace the existing source ledger", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain("mountOfflineSourceLedger");
    expect(dashboard).toContain("unmountLedger();");
  });

  it("does not displace the existing transfer checklist", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain("mountOfflineTransferChecklist");
    expect(dashboard).toContain("unmountChecklist();");
  });

  it("does not displace the existing readiness review", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain("mountOfflineReadiness");
    expect(dashboard).toContain("unmountReadiness();");
  });

  it("does not displace the existing offline diagnostics", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain("mountOfflineDiagnostics");
    expect(dashboard).toContain("unmountDiagnostics();");
  });

  it("does not displace cleanup and session comparison", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const name of ["unmountCleanup", "unmountComparison", "unmountReview"]) {
      expect(dashboard).toContain(`${name}();`);
    }
  });

  it("does not start a download on initial mount", () => {
    const panel = source("recoveryGuidePanel.ts");
    expect(panel).toContain('retry.addEventListener("click", onRetry)');
    expect(panel).not.toContain("setInterval(");
    expect(panel).not.toContain("setTimeout(");
  });

  it("uses the existing 44px button helper", () => {
    const panel = source("recoveryGuidePanel.ts");
    expect(panel).toContain('import { createOfflineAction } from "./accessibilityGuard";');
  });

  it("rechecks inventory before making a selected-cell request", () => {
    const panel = source("recoveryGuidePanel.ts");
    expect(panel).toContain("buildRecoveryPlan(manifest, model.getState().inventory, reading)");
  });
});
