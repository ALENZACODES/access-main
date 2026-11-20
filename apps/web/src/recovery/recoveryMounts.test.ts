import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const shell = readFileSync(new URL("./RecoveryCenter.tsx", import.meta.url), "utf8");
const components = [
  "RecoveryEvidenceNotebook",
  "RecoveryDryRunPanel",
  "RecoveryCaseJournal",
  "RecoveryTaskBoard",
  "RecoveryRepairAttempts",
  "RecoveryFailureChecklist",
] as const;

describe("recovery integration does not replace existing panels", () => {
  it("keeps all six components imported and mounted", () => {
    for (const name of components) {
      expect(shell).toContain(`import { ${name} } from "./${name}";`);
      expect(shell).toContain(`<${name} locale={locale}`);
    }
  });
  it("keeps the checklist gated on fresh inspection", () => {
    expect(shell).toContain(`<RecoveryFailureChecklist locale={locale} records={inventory}`);
    expect(shell).toContain("inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile}");
  });
  it("keeps original workbench, plan, download and export facilities", () => {
    for (const name of ["RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview", "RecoveryNotice"]) {
      expect(shell).toContain(`<${name}`);
    }
    expect(shell).toContain("startDownload");
    expect(shell).toContain("exportReport");
  });
  it("does not embed prohibited organisation names", () => {
    for (const needle of forbiddenOrgNeedles()) {
      expect(shell.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
});
