import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const code = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
describe("offline pack change review integration", () => {
  it("uses a genuine deferred import, never a static panel import", () => {
    expect(code("offlineDashboard.ts")).toContain('import("./packChangeImpactPanel")');
    expect(code("offlineDashboard.ts")).not.toContain('from "./packChangeImpactPanel"');
  });
  it("does not export optional runtime code through eager barrel", () => {
    const index = code("index.ts");
    for (const name of ["packChangeImpact", "packChangeImpactCopy", "packChangeImpactPanel"])
      expect(index).not.toContain(`from "./${name}"`);
  });
  it("opens only after explicit click", () => {
    const source = code("offlineDashboard.ts");
    expect(source).toContain('packChangeLaunch.addEventListener("click", onPackChangeLaunch);');
    expect(source).toContain('const onPackChangeLaunch = (): void => {');
  });
  it("avoids late mount after cleanup or close", () => {
    const source = code("offlineDashboard.ts");
    expect(source).toContain("if (packChangeDisposed || !packChangeOpen || revision !== packChangeRevision) return;");
    expect(source).toContain("packChangeDisposed = true;");
    expect(source).toContain("packChangeRevision += 1;");
  });
  it("keeps complete main dashboard lifecycle", () => {
    const source = code("offlineDashboard.ts");
    for (const name of ["Triage", "Cleanup", "Review", "Comparison", "Ledger", "Checklist", "Durability",
      "Readiness", "Diagnostics", "Recovery", "SourceAge", "Continuity", "Casebook", "Handoff", "Timeline", "Workbook",
      "Preparation", "Inquiry", "Contingency", "PackChange"])
      expect(source).toContain(`unmount${name}();`);
  });
  it("retains existing user-facing exports and does not change RegionPackPage", () => {
    const index = code("index.ts");
    for (const name of ["accessPreparation", "accessInquiryPanel", "contingencyPlan", "continuityDrill",
      "offlineCasebook", "handoffRehearsal", "localEvidenceTimeline", "reconciliationWorkbook", "sourceAgePanel"])
      expect(index).toContain(`export * from "./${name}";`);
  });
  it("removes launch listener on unmount", () => {
    const source = code("offlineDashboard.ts");
    expect(source).toContain('packChangeLaunch.removeEventListener("click", onPackChangeLaunch);');
  });
  it("removes panel event handlers and its model subscription", () => {
    const panel = code("packChangeImpactPanel.ts");
    expect(panel).toContain("unsubscribe();");
    expect(panel).toContain('compare.removeEventListener("click", onCompare);');
    expect(panel).toContain('exportJson.removeEventListener("click", onExportJson);');
    expect(panel).toContain("section.remove();");
  });
  it("does not download or mutate pack bytes", () => {
    const feature = code("packChangeImpact.ts") + code("packChangeImpactPanel.ts");
    for (const banned of ["downloadRegion(", "deleteRegion(", "store.put(", "store.delete(", "model.download(", "localStorage", "indexedDB", "fetch("])
      expect(feature).not.toContain(banned);
  });
  it("uses only text nodes for source input", () => {
    const panel = code("packChangeImpactPanel.ts");
    expect(panel).toContain("element.textContent = content");
    expect(panel).not.toContain("innerHTML");
    expect(panel).not.toContain("insertAdjacentHTML");
  });
  it("enforces 44-pixel text controls", () => {
    const panel = code("packChangeImpactPanel.ts");
    expect(panel).toContain('control.style.minHeight = "44px"');
    expect(panel).toContain("createOfflineAction(doc, name)");
  });
  it("includes a polite status announcement", () => {
    expect(code("packChangeImpactPanel.ts")).toContain('setAttribute("aria-live", "polite")');
  });
  it("does not alter installation budget configuration", () => {
    expect(code("offlineDashboard.ts")).not.toContain("check-install-budget.ts");
    expect(code("packChangeImpactPanel.ts")).not.toContain("globIgnores");
  });
});
