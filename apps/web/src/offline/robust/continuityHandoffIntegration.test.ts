import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("./", import.meta.url);
const source = (name: string): string => readFileSync(new URL(name, root), "utf8");

describe("P12 continuity and handoff wiring preservation", () => {
  it("exports all four continuity modules", () => {
    for (const module of ["continuityDrill", "continuityDrillCopy", "continuityDrillExport", "continuityDrillPanel"]) {
      expect(source("index.ts")).toContain(`export * from "./${module}";`);
    }
  });
  it("mounts the continuity panel on the existing offline dashboard", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain('import { mountOfflineContinuityDrill } from "./continuityDrillPanel";');
    expect(dashboard).toContain('const continuityHost = element("div")');
    expect(dashboard).toContain('const unmountContinuity = mountOfflineContinuityDrill(');
    expect(dashboard).toContain('unmountContinuity();');
  });
  it("keeps handoff lazy and cancels a late mount", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain('import("./handoffRehearsalPanel")');
    expect(dashboard).toContain('if (disposedHandoff) return;');
    expect(dashboard).toContain('disposedHandoff = true;');
    expect(dashboard).toContain('unmountHandoff();');
  });
  it("does not delete other offline modules", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const mount of ["mountOfflineTriage", "mountOfflineCleanup", "mountOfflineUpdateReview",
      "mountOfflineSessionComparison", "mountOfflineSourceLedger", "mountOfflineTransferChecklist",
      "mountStorageDurability", "mountOfflineDiagnostics", "mountOfflineReadiness",
      "mountOfflineRecoveryBatches", "mountOfflineSourceAge"]) {
      expect(dashboard).toContain(`${mount}(`);
    }
  });
  it("does not start downloads or file deletion in the hypothetical panel", () => {
    const panel = source("continuityDrillPanel.ts");
    expect(panel).not.toContain("model.download(");
    expect(panel).not.toContain("model.downloadSelected(");
    expect(panel).not.toContain("model.remove(");
  });
});
