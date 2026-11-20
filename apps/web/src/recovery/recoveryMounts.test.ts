import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const components = [
  "RecoveryEvidenceNotebook",
  "RecoveryDryRunPanel",
  "RecoveryCaseJournal",
  "RecoveryTaskBoard",
  "RecoveryRepairAttempts",
  "RecoveryFailureChecklist",
  "RecoveryTransferPreflight",
  "RecoveryProvenanceLedger",
  "RecoveryHandoffPanel",
  "RecoverySessionTracePanel",
  "RecoveryCheckpointPanel",
  "RecoveryDecisionMatrix",
] as const;

describe("recovery shell preservation and reconciliation integration", () => {
  it("imports and mounts every established panel", () => {
    for (const name of components) {
      expect(shell).toContain(`import { ${name} } from "./${name}";`);
      expect(shell).toContain(`<${name} locale={locale}`);
    }
  });
  it("lazy-loads reconciliation without dropping its inspection gate", () => {
    expect(shell).toContain('await import("./RecoveryReconciliationPanel")');
    expect(shell).toContain("<Suspense fallback=");
    expect(shell).toContain("<RecoveryReconciliationPanel locale={locale}");
    expect(shell).toContain('await import("./RecoveryDrillPanel")');
    expect(shell).toContain("<RecoveryDrillPanel locale={locale}");
  });
  it("keeps all inspection-sensitive panels fail-closed", () => {
    for (const name of [
      "RecoveryTransferPreflight", "RecoveryHandoffPanel", "RecoverySessionTracePanel",
      "RecoveryCheckpointPanel", "RecoveryDecisionMatrix", "RecoveryReconciliationPanel",
    ]) {
      const start = shell.indexOf(`<${name} locale={locale}`);
      expect(start).toBeGreaterThan(-1);
      const end = shell.indexOf("/>", start);
      expect(shell.slice(start, end)).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
    }
  });
  it("retains review, transfer, notices, inventory and export controls", () => {
    for (const name of ["RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview", "RecoveryNotice"]) {
      expect(shell).toContain(`<${name}`);
    }
    expect(shell).toContain("session.start(download)");
    expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)");
  });
  it("exports the reconciliation panel, model, analysis, and distinct copy module", () => {
    expect(barrel).toContain('export { RecoveryReconciliationPanel } from "./RecoveryReconciliationPanel"');
    expect(barrel).toContain('from "./recoveryReconciliation"');
    expect(barrel).toContain('from "./recoveryReconciliationAnalysis"');
    expect(barrel).toContain('from "./recoveryReconciliationCopy"');
  });
  it("preserves the notebook copy API and older recovery exports", () => {
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
    for (const name of [
      "RecoveryTransferPreflight", "RecoveryHandoffPanel", "RecoverySessionTracePanel",
      "RecoveryCheckpointPanel", "RecoveryDecisionMatrix", "RecoveryFailureChecklist",
      "classifyRecoveryError", "RecoveryNotice",
    ]) expect(barrel).toContain(name);
  });
  it("never invents pack usability or suppresses unknown state", () => {
    expect(shell).toContain("UNKNOWN");
    expect(read("./recoveryReconciliationCopy.ts")).not.toContain("UNKNOWN signifie inconnu");
    expect(read("./recoveryReconciliationCopy.ts")).toContain('unknown: "UNKNOWN"');
  });
  it("does not embed prohibited organisation names", () => {
    for (const needle of forbiddenOrgNeedles()) {
      expect(shell.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
});
