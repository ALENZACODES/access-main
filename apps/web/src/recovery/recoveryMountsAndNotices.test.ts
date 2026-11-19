import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const ledger = read("./RecoveryProvenanceLedger.tsx");
const barrel = read("./index.ts");
const components = ["RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal", "RecoveryTaskBoard", "RecoveryRepairAttempts", "RecoveryFailureChecklist", "RecoveryProvenanceLedger"] as const;

describe("live recovery shell integration", () => {
  it("retains every existing panel and adds two panels without replacement", () => {
    for (const name of components) {
      expect(shell).toContain(`import { ${name} } from "./${name}"`);
      expect(shell).toContain(`<${name} locale={locale}`);
    }
  });
  it("preserves workbench, queue, plan, downloads and exports", () => {
    for (const name of ["RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview", "RecoveryNotice"]) expect(shell).toContain(`<${name}`);
    expect(shell).toContain("startDownload");
    expect(shell).toContain("exportReport");
  });
  it("routes the import-preview error through StateNotice", () => {
    expect(ledger).toContain('import { StateNotice } from "../states/StateNotice"');
    expect(ledger).toContain("<StateNotice view=");
    expect(ledger).not.toContain('<p role="alert">');
  });
  it("exports both new panels and their models", () => {
    expect(barrel).toContain('export { RecoveryFailureChecklist } from "./RecoveryFailureChecklist"');
    expect(barrel).toContain('export { RecoveryProvenanceLedger } from "./RecoveryProvenanceLedger"');
    expect(barrel).toContain('from "./recoveryProvenanceLedger"');
  });
  it("does not expose restricted organisation names", () => {
    for (const needle of forbiddenOrgNeedles()) for (const data of [shell, ledger, barrel]) expect(data.toLowerCase()).not.toContain(needle.toLowerCase());
  });
});
