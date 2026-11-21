import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

describe("offline contingency dashboard integration", () => {
  const dashboard = source("offlineDashboard.ts");
  const index = source("index.ts");
  it("uses deferred loading for the optional checklist", () => {
    expect(dashboard).toContain('import("./contingencyPanel")');
  });
  it("does not load the new browser panel through the eager barrel", () => {
    expect(index).not.toContain('export * from "./contingencyPanel"');
  });
  it("creates a dedicated section host", () => {
    expect(dashboard).toContain('const contingencyHost = element("div")');
    expect(dashboard).toContain("section.append(contingencyHost)");
  });
  it("retains disposal protection on late loading", () => {
    expect(dashboard).toContain("if (contingencyDisposed) return;");
  });
  it("disposes the feature when navigating away", () => {
    expect(dashboard).toContain("contingencyDisposed = true;");
    expect(dashboard).toContain("unmountContingency();");
  });
  it("mounts against the existing dashboard model", () => {
    expect(dashboard).toContain("mountOfflineContingency(contingencyHost, manifest, model, language)");
  });
  it("preserves the earlier source-age panel", () => {
    expect(dashboard).toContain("unmountSourceAge();");
  });
  it("preserves reconciliation workbook", () => {
    expect(dashboard).toContain('import("./reconciliationWorkbookPanel")');
    expect(dashboard).toContain("unmountWorkbook();");
  });
  it("preserves the handoff rehearsal", () => {
    expect(dashboard).toContain('import("./handoffRehearsalPanel")');
    expect(dashboard).toContain("unmountHandoff();");
  });
  it("preserves the casebook", () => {
    expect(dashboard).toContain("mountOfflineCasebook(");
    expect(dashboard).toContain("unmountCasebook();");
  });
  it("preserves the continuity drill", () => {
    expect(dashboard).toContain("mountOfflineContinuityDrill(");
    expect(dashboard).toContain("unmountContinuity();");
  });
  it("preserves the local evidence timeline", () => {
    expect(dashboard).toContain('import("./localEvidenceTimelinePanel")');
    expect(dashboard).toContain("unmountTimeline();");
  });
  it("preserves existing cleanup and diagnostics mounts", () => {
    for (const item of ["Triage", "Cleanup", "Review", "Comparison", "Ledger", "Checklist",
      "Durability", "Readiness", "Diagnostics", "Recovery"]) {
      expect(dashboard).toContain(`unmount${item}();`);
    }
  });
  it("uses the existing shared native action helper", () => {
    expect(source("contingencyPanel.ts")).toContain("createOfflineAction(doc, label)");
  });
  it("uses sufficiently large input controls", () => {
    expect(source("contingencyPanel.ts")).toContain('input.style.minHeight = "44px"');
    expect(source("contingencyPanel.ts")).toContain('input.style.minWidth = "44px"');
  });
  it("provides screen reader status announcements", () => {
    expect(source("contingencyPanel.ts")).toContain('live.setAttribute("aria-live", "polite")');
  });
  it("does not introduce automatic contact or timers", () => {
    const panel = source("contingencyPanel.ts");
    expect(panel).not.toContain("setInterval(");
    expect(panel).not.toContain("setTimeout(");
    expect(panel).not.toContain("model.download(");
    expect(panel).not.toContain("model.downloadSelected(");
  });
});
