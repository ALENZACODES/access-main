import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("./", import.meta.url);
function file(name: string): string {
  return readFileSync(new URL(name, root), "utf8");
}

describe("mounted recovery journal wiring", () => {
  it("exports every recovery journal module from the public barrel", () => {
    const barrel = file("index.ts");
    for (const name of ["recoveryJournal", "recoveryJournalCopy",
      "recoveryJournalExport", "recoveryJournalPanel"]) {
      expect(barrel).toContain(`export * from "./${name}";`);
    }
  });

  it("mounts the journal in the existing live offline dashboard", () => {
    const dashboard = file("offlineDashboard.ts");
    expect(dashboard).toContain('import { mountOfflineRecoveryJournal } from "./recoveryJournalPanel";');
    expect(dashboard).toContain("const unmountJournal = mountOfflineRecoveryJournal(");
  });

  it("cleans up journal listeners when the dashboard unmounts", () => {
    expect(file("offlineDashboard.ts")).toContain("unmountJournal();");
  });

  it("does not displace other current-main offline mounts", () => {
    const dashboard = file("offlineDashboard.ts");
    for (const name of ["mountOfflineTriage", "mountOfflineCleanup",
      "mountOfflineUpdateReview", "mountOfflineSessionComparison",
      "mountOfflineSourceLedger", "mountOfflineTransferChecklist",
      "mountStorageDurability", "mountOfflineDiagnostics", "mountOfflineReadiness",
      "mountOfflineRecoveryBatches"]) {
      expect(dashboard).toContain(name);
    }
  });

  it("does not introduce automatic scheduling or network requests", () => {
    const source = [file("recoveryJournal.ts"), file("recoveryJournalPanel.ts"),
      file("recoveryJournalExport.ts")].join("\n");
    expect(source).not.toContain("setInterval(");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("deleteRegion(");
  });

  it("uses the existing 44px action helper", () => {
    const panel = file("recoveryJournalPanel.ts");
    expect(panel).toContain("createOfflineAction");
    expect(panel).toContain('minHeight = "44px"');
  });
});
