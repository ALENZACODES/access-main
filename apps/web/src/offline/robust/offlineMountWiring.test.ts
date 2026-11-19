import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A fail-on-violation guard for the existing route's offline subpanels.
 * Unit tests on individual modules alone do not detect deleted mounts.
 */
const root = new URL("./", import.meta.url);
const source = (name: string): string => readFileSync(new URL(name, root), "utf8");

const panels = [
  { module: "sourceLedgerPanel", mount: "mountOfflineSourceLedger", cleanup: "unmountLedger" },
  { module: "transferChecklistPanel", mount: "mountOfflineTransferChecklist", cleanup: "unmountChecklist" },
  { module: "storageDurabilityPanel", mount: "mountStorageDurability", cleanup: "unmountDurability" },
  { module: "readinessPanel", mount: "mountOfflineReadiness", cleanup: "unmountReadiness" },
  { module: "offlineDiagnosticsPanel", mount: "mountOfflineDiagnostics", cleanup: "unmountDiagnostics" },
] as const;

describe("offline dashboard subpanel wiring", () => {
  it("exports all five installed panels from the public barrel", () => {
    const barrel = source("index.ts");
    for (const panel of panels) {
      expect(barrel).toContain(`export * from "./${panel.module}";`);
    }
  });

  it("keeps all five mounts in the existing dashboard", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const panel of panels) {
      expect(dashboard).toContain(`import { ${panel.mount} } from "./${panel.module}";`);
      expect(dashboard).toContain(`const ${panel.cleanup} = ${panel.mount}(`);
    }
  });

  it("cleans up each mount when the dashboard unmounts", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const panel of panels) expect(dashboard).toContain(`${panel.cleanup}();`);
  });

  it("does not replace existing offline comparison and cleanup mounts", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const functionName of [
      "mountOfflineTriage", "mountOfflineCleanup", "mountOfflineUpdateReview",
      "mountOfflineSessionComparison",
    ]) expect(dashboard).toContain(functionName);
  });

  it("uses the same UNKNOWN token in English and French source copy", () => {
    const file = source("sourceLedgerCopy.ts");
    expect(file).not.toContain("UNKNOWN");
    expect(file).toContain('unknown: "UNKNOWN"');
  });

  it("uses the same UNKNOWN token in English and French checklist copy", () => {
    const file = source("transferChecklistCopy.ts");
    expect(file).not.toContain("UNKNOWN");
    expect(file).toContain('unknown: "UNKNOWN"');
  });

  it("keeps the existing 44px labelled-action helper for each panel", () => {
    for (const panel of panels) {
      expect(source(`${panel.module}.ts`)).toContain("createOfflineAction");
    }
  });
});
