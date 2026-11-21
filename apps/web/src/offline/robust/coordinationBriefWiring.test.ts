import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const content = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
describe("offline coordination integration preserves the merged dashboard", () => {
  it("exports types without eager-loading the optional runtime feature", () => {
    const index = content("index.ts");
    expect(index).toContain('from "./coordinationBrief";');
    expect(index).toContain('from "./coordinationBriefDiff";');
    expect(index).not.toContain('export * from "./coordinationBriefPanel"');
    expect(index).not.toContain('export * from "./coordinationBrief"');
    expect(index).not.toContain('export * from "./coordinationBriefCopy"');
    expect(index).not.toContain('export * from "./coordinationBriefExport"');
  });
  it("loads the optional panel only after a user action", () => {
    const dashboard = content("offlineDashboard.ts");
    expect(dashboard).toContain('import("./coordinationBriefPanel")');
    expect(dashboard).toContain('coordinationLaunch.addEventListener("click", onCoordinationLaunch);');
  });
  it("does not mount asynchronously after cleanup", () => {
    const dashboard = content("offlineDashboard.ts");
    expect(dashboard).toContain("if (coordinationDisposed || !coordinationOpen || token !== coordinationRevision) return;");
    expect(dashboard).toContain("coordinationDisposed = true;");
    expect(dashboard).toContain("unmountCoordination();");
    expect(dashboard).toContain('coordinationLaunch.removeEventListener("click", onCoordinationLaunch);');
  });
  it("keeps the old workbook, handoff, timeline and source-age lifecycle", () => {
    const dashboard = content("offlineDashboard.ts");
    for (const name of ["Triage", "Cleanup", "Review", "Comparison", "Ledger", "Checklist", "Durability",
      "Readiness", "Diagnostics", "Recovery", "SourceAge", "Continuity", "Casebook", "Handoff", "Timeline", "Workbook",
      "Preparation", "Inquiry", "Contingency"]) {
      expect(dashboard).toContain(`unmount${name}();`);
    }
  });
  it("retains the exact existing public exports", () => {
    const index = content("index.ts");
    for (const name of ["accessPreparation", "accessInquiryPanel", "contingencyPlan", "continuityDrill",
      "offlineCasebook", "handoffRehearsal", "localEvidenceTimeline", "reconciliationWorkbook", "sourceAgePanel"]) {
      expect(index).toContain(`export * from "./${name}";`);
    }
  });
  it("keeps the existing deferred feature mounts", () => {
    const dashboard = content("offlineDashboard.ts");
    for (const name of ["accessPreparationPanel", "accessInquiryPanel", "contingencyPanel",
      "localEvidenceTimelinePanel", "reconciliationWorkbookPanel", "handoffRehearsalPanel"]) {
      expect(dashboard).toContain(`import("./${name}")`);
    }
  });
  it("keeps the region-pack page and its recovery tests untouched", () => {
    expect(content("coordinationBriefPanel.ts")).not.toContain("RegionPackPage");
    expect(content("coordinationBriefPanel.ts")).not.toContain("RecoveryCenter");
  });
  it("keeps controls at least 44 pixels", () => {
    const panel = content("coordinationBriefPanel.ts");
    expect(panel).toContain('style.minHeight = "44px"');
    expect(panel).toContain('style.minWidth = "44px"');
  });
  it("uses polite status and no HTML injection", () => {
    const panel = content("coordinationBriefPanel.ts");
    expect(panel).toContain('setAttribute("aria-live", "polite")');
    expect(panel).not.toContain("innerHTML");
    expect(panel).not.toContain("insertAdjacentHTML");
  });
  it("leaves saved pack bytes untouched", () => {
    const panel = content("coordinationBriefPanel.ts");
    for (const fragment of ["downloadRegion(", "deleteRegion(", "model.download(", "fetch(", "localStorage", "indexedDB", "setInterval("]) {
      expect(panel).not.toContain(fragment);
    }
  });
  it("removes dynamically created row listeners", () => {
    const panel = content("coordinationBriefPanel.ts");
    expect(panel).toContain("clearRowListeners();");
    expect(panel).toContain("for (const off of listeners) off();");
    expect(panel).toContain("section.remove();");
  });
});
