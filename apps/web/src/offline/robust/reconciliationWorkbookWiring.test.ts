import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (filename: string): string => readFileSync(new URL(filename, import.meta.url), "utf8");

describe("reconciliation workbook route integration", () => {
  it("exports the reconciliation model through the public barrel", () => {
    expect(source("index.ts")).toContain('export * from "./reconciliationWorkbook";');
  });
  it("exports bilingual copy through the public barrel", () => {
    expect(source("index.ts")).toContain('export * from "./reconciliationWorkbookCopy";');
  });
  it("exports the report logic through the public barrel", () => {
    expect(source("index.ts")).toContain('export * from "./reconciliationWorkbookExport";');
  });
  it("exports the panel through the public barrel", () => {
    expect(source("index.ts")).toContain('export * from "./reconciliationWorkbookPanel";');
  });
  it("provides a host for the panel", () => {
    expect(source("offlineDashboard.ts")).toContain('const workbookHost = element("div")');
  });
  it("loads the panel using a deferred import", () => {
    expect(source("offlineDashboard.ts")).toContain('import("./reconciliationWorkbookPanel")');
  });
  it("uses the mounted reconciliation panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineReconciliationWorkbook(workbookHost, manifest, model, language)");
  });
  it("does not mount after the dashboard has been closed", () => {
    expect(source("offlineDashboard.ts")).toContain("if (disposedWorkbook) return");
  });
  it("disposes the workbook when navigating away", () => {
    expect(source("offlineDashboard.ts")).toContain("unmountWorkbook()");
  });
  it("marks the dashboard's workbook as disposed", () => {
    expect(source("offlineDashboard.ts")).toContain("disposedWorkbook = true");
  });
  it("preserves the triage panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineTriage(");
  });
  it("preserves the cleanup panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineCleanup(");
  });
  it("preserves the update review panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineUpdateReview(");
  });
  it("preserves the existing session comparison panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineSessionComparison(");
  });
  it("preserves the source ledger panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineSourceLedger(");
  });
  it("preserves the transfer checklist panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineTransferChecklist(");
  });
  it("preserves the storage durability panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountStorageDurability(");
  });
  it("preserves the existing diagnostics panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineDiagnostics(");
  });
  it("preserves the existing readiness panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineReadiness(");
  });
  it("preserves the existing recovery batch panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineRecoveryBatches(");
  });
  it("preserves the existing source age panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineSourceAge(");
  });
  it("uses a shared 44px action helper", () => {
    expect(source("reconciliationWorkbookPanel.ts")).toContain("createOfflineAction(doc, label)");
  });
  it("uses native select targets sized to at least 44px", () => {
    expect(source("reconciliationWorkbookPanel.ts")).toContain('control.style.minHeight = "44px"');
  });
  it("provides accessible labels for its inputs", () => {
    expect(source("reconciliationWorkbookPanel.ts")).toContain("wrapper.htmlFor = id");
  });
  it("uses polite announcements instead of modal interruptions", () => {
    expect(source("reconciliationWorkbookPanel.ts")).toContain('status.setAttribute("aria-live", "polite")');
  });
  it("does not trigger downloads while reconciling historical readings", () => {
    expect(source("reconciliationWorkbookPanel.ts")).not.toContain("model.download(");
    expect(source("reconciliationWorkbookPanel.ts")).not.toContain("model.downloadSelected(");
  });
  it("does not delete stored region cells", () => {
    expect(source("reconciliationWorkbookPanel.ts")).not.toContain("dependencies.store.delete");
  });
  it("does not begin periodic background processing", () => {
    for (const name of ["reconciliationWorkbook.ts", "reconciliationWorkbookPanel.ts", "reconciliationWorkbookExport.ts"]) {
      expect(source(name)).not.toContain("setInterval(");
      expect(source(name)).not.toContain("setTimeout(");
    }
  });
  it("keeps the existing precache limit outside feature code", () => {
    expect(source("offlineDashboard.ts")).not.toContain("524288 +");
  });
  it("does not make a synchronous dashboard import in the pressure entry", () => {
    expect(source("storagePressure.ts")).not.toContain('import { mountOfflineDashboard } from "./offlineDashboard";');
  });
  it("defers the substantial dashboard from the pressure entry", () => {
    expect(source("storagePressure.ts")).toContain('import("./offlineDashboard")');
  });
});
