import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const here = new URL("./", import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, here), "utf8");

const mounted = [
  { entry: "storageScenarioPanel", call: "mountStorageScenarioPanel", dispose: "unmountScenario" },
  { entry: "recoveryJournalPanel", call: "mountOfflineRecoveryJournal", dispose: "unmountJournal" },
] as const;

describe("P12 storage scenarios and recovery journal coexist", () => {
  it("exports the complete public modules for both features", () => {
    const barrel = read("index.ts");
    for (const name of [
      "storageScenario", "storageScenarioCopy", "storageScenarioExport", "storageScenarioPanel",
      "recoveryJournal", "recoveryJournalCopy", "recoveryJournalExport", "recoveryJournalPanel",
    ]) {
      expect(barrel).toContain(`export * from "./${name}";`);
    }
  });

  it("imports and mounts both panels through the live dashboard", () => {
    const dashboard = read("offlineDashboard.ts");
    for (const panel of mounted) {
      expect(dashboard).toContain(`import { ${panel.call} } from "./${panel.entry}";`);
      expect(dashboard).toContain(`const ${panel.dispose} = ${panel.call}(`);
    }
  });

  it("disposes both panels without dropping existing offline mounts", () => {
    const dashboard = read("offlineDashboard.ts");
    for (const panel of mounted) expect(dashboard).toContain(`${panel.dispose}();`);
    for (const name of [
      "unmountTriage", "unmountCleanup", "unmountReview", "unmountComparison",
      "unmountLedger", "unmountChecklist", "unmountDurability", "unmountReadiness",
      "unmountDiagnostics", "unmountRecovery",
    ]) expect(dashboard).toContain(`${name}();`);
  });
});
