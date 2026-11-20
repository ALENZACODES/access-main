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

describe("recovery shell preservation and evidence packet integration", () => {
  it("imports and mounts every established panel and the packet panel", () => {
    for (const name of components) {
      expect(shell).toContain(`import { ${name} } from "./${name}";`);
      expect(shell).toContain(`<${name} locale={locale}`);
    }
  });
  it("loads the packet panel in a separate chunk without dropping its mount", () => {
    expect(shell).toContain('await import("./RecoveryEvidencePacketPanel")');
    expect(shell).toContain("<Suspense fallback=");
    expect(shell).toContain("<RecoveryEvidencePacketPanel locale={locale}");
  });
  it("keeps all inspection-sensitive panels fail-closed", () => {
    for (const name of [
      "RecoveryTransferPreflight", "RecoveryHandoffPanel", "RecoverySessionTracePanel",
      "RecoveryCheckpointPanel", "RecoveryDecisionMatrix", "RecoveryEvidencePacketPanel",
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
  it("exports the packet panel, model, analysis, and distinct copy module", () => {
    expect(barrel).toContain('export { RecoveryEvidencePacketPanel } from "./RecoveryEvidencePacketPanel"');
    expect(barrel).toContain('from "./recoveryEvidencePacket"');
    expect(barrel).toContain('from "./recoveryEvidenceAnalysis"');
    expect(barrel).toContain('from "./recoveryEvidencePacketCopy"');
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
    expect(read("./recoveryEvidencePacketCopy.ts")).not.toContain("UNKNOWN signifie inconnu");
    expect(read("./recoveryEvidencePacketCopy.ts")).toContain('unknown: "UNKNOWN"');
  });
  it("does not embed prohibited organisation names", () => {
    for (const needle of forbiddenOrgNeedles()) {
      expect(shell.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
});
