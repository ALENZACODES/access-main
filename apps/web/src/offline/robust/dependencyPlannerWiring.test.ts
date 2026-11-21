import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
describe("offline dependency planner integration", () => {
  it("exports the model, bilingual copy and metadata report", () => {
    const index = source("index.ts");
    for (const name of ["dependencyPlanner", "dependencyPlannerCopy", "dependencyPlannerExport"])
      expect(index).toContain(`export * from "./${name}";`);
  });
  it("keeps the UI in a deferred chunk rather than the eager barrel", () => {
    const index = source("index.ts");
    expect(index).not.toContain('export * from "./dependencyPlannerPanel";');
    expect(source("offlineDashboard.ts")).toContain('import("./dependencyPlannerPanel")');
  });
  it("mounts a panel with an explicit disposal guard", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain("if (dependencyDisposed) return;");
    expect(dashboard).toContain("unmountDependency = mountOfflineDependencyPlanner(");
    expect(dashboard).toContain("dependencyDisposed = true;");
    expect(dashboard).toContain("unmountDependency();");
  });
  it("preserves all previously merged dashboard features", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const name of ["unmountContinuity();", "unmountCasebook();", "unmountHandoff();", "unmountTimeline();",
      "unmountWorkbook();", "unmountPreparation();", "unmountSourceAge();"])
      expect(dashboard).toContain(name);
  });
  it("never writes to a real data cell", () => {
    const model = source("dependencyPlanner.ts");
    const panel = source("dependencyPlannerPanel.ts");
    for (const forbidden of ["store.put(", "store.delete(", "model.download(", "model.remove(", "fetch(", "setInterval("])
      expect(model + panel).not.toContain(forbidden);
  });
  it("uses minimum 44-pixel controls", () => {
    const panel = source("dependencyPlannerPanel.ts");
    expect(panel).toContain('style.minHeight = "44px"');
    expect(panel).toContain('style.minWidth = "44px"');
  });
  it("uses safe text nodes, not HTML injection", () => {
    const panel = source("dependencyPlannerPanel.ts");
    expect(panel).toContain("textContent = content");
    expect(panel).not.toContain("innerHTML");
    expect(panel).not.toContain("insertAdjacentHTML");
  });
  it("removes event listeners and subscription on cleanup", () => {
    const panel = source("dependencyPlannerPanel.ts");
    expect(panel).toContain("unsubscribe();");
    expect(panel).toContain("unlisten();");
    expect(panel).toContain("clearRows();");
    expect(panel).toContain("section.remove();");
  });
  it("never changes RegionPackPage implementation or tests", () => {
    expect(source("offlineDashboard.ts")).not.toContain("RegionPackPage.dom.test.tsx");
    expect(source("dependencyPlannerPanel.ts")).not.toContain("RegionPackPage");
  });
});
