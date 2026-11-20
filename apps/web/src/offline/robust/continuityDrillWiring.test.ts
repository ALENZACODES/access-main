import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = new URL("./", import.meta.url);
const source = (name: string): string => readFileSync(new URL(name, path), "utf8");

describe("offline continuity drill live dashboard wiring", () => {
  it("exports the pure drill engine", () => {
    expect(source("index.ts")).toContain('export * from "./continuityDrill";');
  });
  it("exports the EN/FR copy", () => {
    expect(source("index.ts")).toContain('export * from "./continuityDrillCopy";');
  });
  it("exports metadata-only reports", () => {
    expect(source("index.ts")).toContain('export * from "./continuityDrillExport";');
  });
  it("exports the mounted continuity panel", () => {
    expect(source("index.ts")).toContain('export * from "./continuityDrillPanel";');
  });
  it("imports the continuity panel into the existing dashboard", () => {
    expect(source("offlineDashboard.ts")).toContain('import { mountOfflineContinuityDrill } from "./continuityDrillPanel";');
  });
  it("creates a host for the continuity panel", () => {
    expect(source("offlineDashboard.ts")).toContain('const continuityHost = element("div")');
  });
  it("mounts the continuity panel on the live dashboard", () => {
    expect(source("offlineDashboard.ts")).toContain('const unmountContinuity = mountOfflineContinuityDrill(');
  });
  it("cleans up its subscriptions when leaving the dashboard", () => {
    expect(source("offlineDashboard.ts")).toContain("unmountContinuity();");
  });
  it("keeps the pre-existing offline triage mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineTriage(");
  });
  it("keeps the pre-existing cleanup mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineCleanup(");
  });
  it("keeps the pre-existing copy review mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineUpdateReview(");
  });
  it("keeps the pre-existing comparison mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineSessionComparison(");
  });
  it("keeps the pre-existing source ledger mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineSourceLedger(");
  });
  it("keeps the pre-existing transfer checklist mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineTransferChecklist(");
  });
  it("keeps the pre-existing storage retention mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountStorageDurability(");
  });
  it("keeps the pre-existing diagnostics mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineDiagnostics(");
  });
  it("keeps the pre-existing readiness mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineReadiness(");
  });
  it("keeps the pre-existing recovery batch mount", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineRecoveryBatches(");
  });
  it("does not trigger downloads during a hypothetical drill", () => {
    expect(source("continuityDrillPanel.ts")).not.toContain("model.downloadSelected(");
    expect(source("continuityDrillPanel.ts")).not.toContain("model.download(");
  });
  it("does not trigger cleanup during a hypothetical drill", () => {
    expect(source("continuityDrillPanel.ts")).not.toContain("model.remove(");
  });
  it("creates native keyboard-operable buttons", () => {
    expect(source("continuityDrillPanel.ts")).toContain("createOfflineAction(doc, value)");
  });
  it("uses correctly labelled numeric inputs", () => {
    expect(source("continuityDrillPanel.ts")).toContain("wrapper.htmlFor = id");
  });
  it("provides a polite status announcement", () => {
    expect(source("continuityDrillPanel.ts")).toContain('setAttribute("aria-live", "polite")');
  });
  it("uses 44px minimum select targets", () => {
    expect(source("continuityDrillPanel.ts")).toContain('select.style.minHeight = "44px"');
  });
  it("uses 44px minimum input targets", () => {
    expect(source("continuityDrillPanel.ts")).toContain('input.style.minHeight = "44px"');
  });
  it("does not introduce background monitoring", () => {
    for (const file of ["continuityDrill.ts", "continuityDrillPanel.ts", "continuityDrillExport.ts"]) {
      expect(source(file)).not.toContain("setInterval(");
      expect(source(file)).not.toContain("setTimeout(");
    }
  });
  it("does not import third-party tile endpoints", () => {
    for (const file of ["continuityDrill.ts", "continuityDrillPanel.ts", "continuityDrillExport.ts"]) {
      expect(source(file)).not.toContain("tile.openstreetmap.org");
    }
  });
  it("preserves the literal UNKNOWN token in report code", () => {
    expect(source("continuityDrillExport.ts")).toContain('tier: "UNKNOWN"');
  });
  it("allows only metadata-only reports", () => {
    expect(source("continuityDrillExport.ts")).toContain("No cell payload");
  });
  it("keeps user-visible French unknown statuses as UNKNOWN", () => {
    expect(source("continuityDrillCopy.ts")).toContain('unknown: "UNKNOWN"');
    expect(source("continuityDrillCopy.ts").match(/unknown: "UNKNOWN"/g)).toHaveLength(2);
  });
});
