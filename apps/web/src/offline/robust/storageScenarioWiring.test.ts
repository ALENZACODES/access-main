import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("./", import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, root), "utf8");

/** Test the actual mounted code, not only the standalone planning helpers. */
describe("storage planning route integration", () => {
  it("exports the pure planner, bilingual copy, local export and mounted panel", () => {
    const barrel = read("index.ts");
    for (const file of ["storageScenario", "storageScenarioCopy", "storageScenarioExport", "storageScenarioPanel"]) {
      expect(barrel).toContain(`export * from "./${file}";`);
    }
  });

  it("mounts the planning panel on the existing offline dashboard", () => {
    const dashboard = read("offlineDashboard.ts");
    expect(dashboard).toContain('import { mountStorageScenarioPanel } from "./storageScenarioPanel";');
    expect(dashboard).toContain("const unmountScenario = mountStorageScenarioPanel(");
    expect(dashboard).toContain("unmountScenario();");
  });

  it("preserves every previously mounted offline workspace", () => {
    const dashboard = read("offlineDashboard.ts");
    const existing = [
      "mountOfflineTriage", "mountOfflineCleanup", "mountOfflineUpdateReview",
      "mountOfflineSessionComparison", "mountOfflineSourceLedger",
      "mountOfflineTransferChecklist", "mountStorageDurability",
      "mountOfflineDiagnostics", "mountOfflineReadiness",
    ];
    for (const item of existing) expect(dashboard).toContain(item);
  });

  it("does not connect scenario planning to a write or download operation", () => {
    const panel = read("storageScenarioPanel.ts");
    expect(panel).not.toContain("model.download(");
    expect(panel).not.toContain("model.downloadSelected(");
    expect(panel).not.toContain("store.put(");
    expect(panel).not.toContain("store.delete(");
    expect(panel).not.toContain("fetch(");
  });

  it("uses the shared 44-pixel native action helper", () => {
    expect(read("storageScenarioPanel.ts")).toContain("createOfflineAction");
    expect(read("storageScenarioPanel.ts")).toContain('field.style.minHeight = "44px"');
  });

  it("retains explicit UNKNOWN and per-cell source fields", () => {
    const logic = read("storageScenario.ts");
    const report = read("storageScenarioExport.ts");
    expect(logic).toContain('"UNKNOWN"');
    for (const value of ["source", "licence", "date", "sourceTier"]) {
      expect(report).toContain(value);
    }
  });
});
