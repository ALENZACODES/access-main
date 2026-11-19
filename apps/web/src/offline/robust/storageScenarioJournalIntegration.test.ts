import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const folder = new URL("./", import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, folder), "utf8");

const mountedFeatures = [
  {
    modules: ["storageScenario", "storageScenarioCopy", "storageScenarioExport", "storageScenarioPanel"],
    component: "mountStorageScenarioPanel",
    host: "scenarioHost",
    unmount: "unmountScenario",
  },
  {
    modules: ["recoveryJournal", "recoveryJournalCopy", "recoveryJournalExport", "recoveryJournalPanel"],
    component: "mountOfflineRecoveryJournal",
    host: "journalHost",
    unmount: "unmountJournal",
  },
] as const;

describe("storage scenario and recovery journal coexistence", () => {
  it("preserves each module export in the public barrel", () => {
    const barrel = read("index.ts");
    for (const feature of mountedFeatures) {
      for (const moduleName of feature.modules) {
        expect(barrel).toContain(`export * from "./${moduleName}";`);
      }
    }
  });

  it("imports both mounted panels into the live dashboard", () => {
    const dashboard = read("offlineDashboard.ts");
    for (const feature of mountedFeatures) {
      const panelModule = feature.modules[3];
      expect(dashboard).toContain(`import { ${feature.component} } from "./${panelModule}";`);
    }
  });

  it("mounts each feature on its own host", () => {
    const dashboard = read("offlineDashboard.ts");
    for (const feature of mountedFeatures) {
      expect(dashboard).toContain(`const ${feature.host} = element("div");`);
      expect(dashboard).toContain(`section.append(${feature.host});`);
      expect(dashboard).toContain(`const ${feature.unmount} = ${feature.component}(${feature.host},`);
    }
  });

  it("cleans up both mounted features on dashboard disposal", () => {
    const dashboard = read("offlineDashboard.ts");
    for (const feature of mountedFeatures) {
      expect(dashboard).toContain(`${feature.unmount}();`);
    }
  });

  it("does not replace the earlier offline panels", () => {
    const dashboard = read("offlineDashboard.ts");
    for (const existing of [
      "mountOfflineTriage", "mountOfflineCleanup", "mountOfflineUpdateReview",
      "mountOfflineSessionComparison", "mountOfflineSourceLedger",
      "mountOfflineTransferChecklist", "mountStorageDurability",
      "mountOfflineDiagnostics", "mountOfflineReadiness", "mountOfflineRecoveryBatches",
    ]) {
      expect(dashboard).toContain(existing);
    }
  });

  it("keeps UNKNOWN unchanged in both feature copy modules", () => {
    for (const moduleName of ["storageScenarioCopy.ts", "recoveryJournalCopy.ts"]) {
      const source = read(moduleName);
      expect(source).toContain("UNKNOWN");
      expect(source).not.toContain("INCONNU");
    }
  });
});
