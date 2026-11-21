import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");
const robust = (name: string): string => read(`apps/web/src/offline/robust/${name}`);

/** Optional, explicitly launched features must not enlarge the initial precache. */
describe("optional offline panels and the install cap", () => {
  it("keeps three heavyweight panels out of Workbox precache", () => {
    const config = read("apps/web/vite.config.ts");
    for (const chunk of ["offlineQuestionSheetPanel", "coordinationBriefPanel", "snapshotComparisonPanel"]) {
      expect(config).toContain(`"**/${chunk}-*.js"`);
    }
    expect(config).toContain('"**/NarrowAuditPage-*.js"');
  });
  it("keeps the first-install checker and cap unchanged", () => {
    const guard = read("apps/web/scripts/check-install-budget.ts");
    expect(guard).toContain("assertInstallBudget(assets)");
    expect(guard).not.toContain("offlineQuestionSheetPanel");
    expect(read("apps/web/src/perf/install-budget.ts")).toContain("4_141_875");
  });
  it("loads the question sheet only after a user click", () => {
    const dashboard = robust("offlineDashboard.ts");
    expect(dashboard).toContain('questionLaunch.addEventListener("click", onQuestionLaunch);');
    expect(dashboard).toContain('import("./offlineQuestionSheetPanel")');
    expect(dashboard).toContain("questionDisposed = true;");
    expect(dashboard).toContain("unmountQuestion();");
  });
  it("retains existing inquiry and three explicitly launched features", () => {
    const dashboard = robust("offlineDashboard.ts");
    for (const p of ["accessInquiryPanel", "offlineQuestionSheetPanel", "coordinationBriefPanel", "snapshotComparisonPanel"])
      expect(dashboard).toContain(`import("./${p}")`);
    for (const name of ["Inquiry", "Contingency", "Coordination", "Snapshot", "Question"])
      expect(dashboard).toContain(`unmount${name}();`);
  });
  it("does not import the optional panel from the eager robustness barrel", () => {
    const barrel = robust("index.ts");
    for (const name of ["offlineQuestionSheetPanel", "snapshotComparisonPanel", "coordinationBriefPanel"])
      expect(barrel).not.toContain(`export * from "./${name}"`);
  });
});
