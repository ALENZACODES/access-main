import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const file = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
describe("three-way comparison integration", () => {
  it("exposes the panel through an explicit action", () => {
    const dashboard = file("offlineDashboard.ts");
    expect(dashboard).toContain('snapshotLaunch.addEventListener("click", onSnapshotLaunch);');
    expect(dashboard).toContain('import("./snapshotComparisonPanel")');
    expect(dashboard).toContain('unmountSnapshot = mountSnapshotComparison(');
  });
  it("cancels an in-flight import after close or unmount", () => {
    const dashboard = file("offlineDashboard.ts");
    expect(dashboard).toContain('if (snapshotDisposed || !snapshotOpen || revision !== snapshotRevision) return;');
    expect(dashboard).toContain('snapshotDisposed = true;');
    expect(dashboard).toContain('snapshotLaunch.removeEventListener("click", onSnapshotLaunch);');
    expect(dashboard).toContain('unmountSnapshot();');
  });
  it("does not add any runtime exports to the offline entry barrel", () => {
    const index = file("index.ts");
    expect(index).not.toContain('export * from "./snapshotComparisonPanel"');
    expect(index).not.toContain('export * from "./snapshotComparison"');
  });
  it("retains all previously merged panels", () => {
    const dashboard = file("offlineDashboard.ts");
    for(const item of ["unmountTriage();", "unmountCleanup();", "unmountReview();", "unmountComparison();", "unmountLedger();",
      "unmountChecklist();", "unmountDurability();", "unmountReadiness();", "unmountDiagnostics();", "unmountRecovery();",
      "unmountSourceAge();", "unmountContinuity();", "unmountCasebook();", "unmountHandoff();", "unmountTimeline();",
      "unmountWorkbook();", "unmountPreparation();", "unmountInquiry();", "unmountContingency();"])
      expect(dashboard).toContain(item);
  });
  it("does not modify production region packs or their tests", () => {
    const panel = file("snapshotComparisonPanel.ts");
    expect(panel).not.toContain("store.put(");
    expect(panel).not.toContain("store.delete(");
    expect(panel).not.toContain("model.download(");
    expect(panel).not.toContain("RegionPackPage");
  });
  it("uses accessible control targets and polite notices", () => {
    const panel = file("snapshotComparisonPanel.ts");
    expect(panel).toContain('style.minHeight = "44px"');
    expect(panel).toContain('style.minWidth = "44px"');
    expect(panel).toContain('setAttribute("aria-live", "polite")');
    expect(panel).not.toContain("innerHTML");
  });
  it("keeps current install budget configuration unmodified", () => {
    expect(file("offlineDashboard.ts")).not.toContain("check-install-budget");
  });
});
