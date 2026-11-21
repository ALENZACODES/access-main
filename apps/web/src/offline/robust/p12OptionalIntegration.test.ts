import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");
const robust = (name: string): string => read(`apps/web/src/offline/robust/${name}`);
describe("all optional offline feature integrations", () => {
  it("keeps the explicit click boundaries for large modules", () => {
    const ui = robust("offlineDashboard.ts");
    for (const panel of ["coordinationBriefPanel", "snapshotComparisonPanel", "offlineQuestionSheetPanel", "packChangeImpactPanel"])
      expect(ui).toContain(`import("./${panel}")`);
    for (const name of ["coordinationLaunch", "snapshotLaunch", "questionLaunch", "packChangeLaunch"])
      expect(ui).toContain(`${name}.addEventListener("click",`);
  });
  it("preserves all local offline mounts and teardown functions", () => {
    const ui = robust("offlineDashboard.ts");
    for (const name of ["Continuity", "Casebook", "Handoff", "Timeline", "Workbook", "Preparation", "Inquiry", "Contingency", "Dependency", "Coordination", "Snapshot", "Question", "PackChange"])
      expect(ui).toContain(`unmount${name}();`);
  });
  it("does not alter the budget guard or its cap", () => {
    expect(read("apps/web/scripts/check-install-budget.ts")).toContain("assertInstallBudget(assets)");
    expect(read("apps/web/src/perf/install-budget.ts")).toContain("4_141_875");
  });
  it("has the dependency model without loading optional panels through the barrel", () => {
    const barrel = robust("index.ts");
    expect(barrel).toContain('export * from "./dependencyPlanner";');
    for (const panel of ["coordinationBriefPanel", "offlineQuestionSheetPanel", "snapshotComparisonPanel", "packChangeImpactPanel"])
      expect(barrel).not.toContain(`export * from "./${panel}"`);
  });
});
