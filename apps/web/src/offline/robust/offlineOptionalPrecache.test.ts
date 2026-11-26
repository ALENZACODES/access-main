import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (file: string): string => readFileSync(path.join(root, file), "utf8");
const robust = (name: string): string => read(`apps/web/src/offline/robust/${name}`);

// This unit test checks which hashed assets the production Workbox globs select.
function patterns(config: string, key: "globPatterns" | "globIgnores"): string[] {
  const values = new RegExp(`\\b${key}:\\s*(\\[[^\\]]+\\])`).exec(config)?.[1];
  if (!values) throw new Error(`Missing Workbox ${key}`);
  return JSON.parse(values) as string[];
}

describe("optional offline panels and the install cap", () => {
  it.each([
    "offlineQuestionSheetPanel",
    "coordinationBriefPanel",
    "snapshotComparisonPanel",
    "packChangeImpactPanel",
  ])("includes the lazy %s chunk in the first install", (panel) => {
    const config = read("apps/web/vite.config.ts");
    const asset = `assets/${panel}-Xb73Ks92.js`;
    expect(patterns(config, "globPatterns").some((glob) => path.posix.matchesGlob(asset, glob))).toBe(true);
    expect(patterns(config, "globIgnores").some((glob) => path.posix.matchesGlob(asset, glob))).toBe(false);
  });
  it("keeps the first-install checker and cap unchanged", () => {
    const guard = read("apps/web/scripts/check-install-budget.ts");
    expect(guard).toContain("assertInstallBudget(assets)");
    expect(guard).not.toContain("offlineQuestionSheetPanel");
    expect(read("apps/web/src/perf/install-budget.ts")).toContain("4_718_592");
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
