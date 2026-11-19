import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const here = new URL("./", import.meta.url);
const file = (name: string): string => readFileSync(new URL(name, here), "utf8");
const modules = [
  ["sourceLedger", "sourceLedgerPanel", "mountOfflineSourceLedger", "unmountLedger"],
  ["transferChecklist", "transferChecklistPanel", "mountOfflineTransferChecklist", "unmountChecklist"],
  ["storageDurability", "storageDurabilityPanel", "mountStorageDurability", "unmountDurability"],
  ["readinessReview", "readinessPanel", "mountOfflineReadiness", "unmountReadiness"],
  ["offlineDiagnostics", "offlineDiagnosticsPanel", "mountOfflineDiagnostics", "unmountDiagnostics"],
] as const;

describe("P12 mounted offline modules", () => {
  it("exports every module from the existing barrel", () => {
    const barrel = file("index.ts");
    for (const [core, panel] of modules) {
      expect(barrel).toContain(`export * from "./${core}";`);
      expect(barrel).toContain(`export * from "./${panel}";`);
    }
  });
  it("mounts and disposes each feature without removing existing panels", () => {
    const dashboard = file("offlineDashboard.ts");
    for (const [, panel, mount, unmount] of modules) {
      expect(dashboard).toContain(`import { ${mount} } from "./${panel}";`);
      expect(dashboard).toContain(`const ${unmount} = ${mount}(`);
      expect(dashboard).toContain(`${unmount}();`);
    }
    for (const existing of ["unmountTriage", "unmountCleanup", "unmountReview", "unmountComparison"]) {
      expect(dashboard).toContain(`${existing}();`);
    }
  });
  it("keeps UNKNOWN as a consistent cross-language data token", () => {
    for (const name of ["sourceLedgerCopy.ts", "transferChecklistCopy.ts", "readinessCopy.ts", "offlineDiagnosticsCopy.ts"]) {
      expect(file(name)).not.toContain("INCONNU");
    }
  });
  it("does not introduce background jobs or scheduled workflows", () => {
    for (const name of ["offlineDashboard.ts", "sourceLedgerPanel.ts", "transferChecklistPanel.ts", "storageDurabilityPanel.ts", "readinessPanel.ts", "offlineDiagnosticsPanel.ts"]) {
      const text = file(name);
      expect(text).not.toContain("setInterval(");
      expect(text).not.toContain("scheduleJob(");
    }
  });
});
