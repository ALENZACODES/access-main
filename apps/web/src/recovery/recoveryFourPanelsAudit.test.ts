import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const shell = readFileSync(new URL("./RecoveryCenter.tsx", import.meta.url), "utf8");
const barrel = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const documentation = readFileSync(new URL("./RECOVERY_CASE_JOURNAL.md", import.meta.url), "utf8");
const modules = ["RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal", "RecoveryTaskBoard"] as const;

describe("four recovery panels on the live page", () => {
  it("keeps all four imports and actual component mounts", () => {
    for (const name of modules) {
      expect(shell).toContain(`import { ${name} } from "./${name}"`);
      expect(shell).toContain(`<${name} locale={locale}`);
    }
  });
  it("keeps all panel mounts together and passes the current inspection date", () => {
    const entry = shell.indexOf("<RecoveryEvidenceNotebook");
    const rehearsal = shell.indexOf("<RecoveryDryRunPanel");
    const journal = shell.indexOf("<RecoveryCaseJournal");
    const taskBoard = shell.indexOf("<RecoveryTaskBoard");
    expect(entry).toBeGreaterThan(-1);
    expect(rehearsal).toBeGreaterThan(entry);
    expect(journal).toBeGreaterThan(rehearsal);
    expect(taskBoard).toBeGreaterThan(journal);
    expect(shell).toContain('inspectionDate={inspectionDate}');
    expect(shell).toContain('inspected={hasInspected && !checking && !inventoryFailure}');
  });
  it("keeps the existing recovery plan and download functionality", () => {
    expect(shell).toContain("<RecoveryPlanReview");
    expect(shell).toContain("<RecoveryQueuePanel");
    expect(shell).toContain("<RecoveryWorkbench");
    expect(shell).toContain("session.start(download)");
  });
  it("exports the four components and the required public types", () => {
    for (const name of modules) {
      expect(barrel).toContain(`export { ${name} }`);
      expect(barrel).toContain(`export type { ${name}Props }`);
      expect(documentation).toContain(name);
    }
  });
  it("never ships prohibited terms or competing name builders", () => {
    for (const name of modules) {
      const content = readFileSync(new URL(`./${name}.tsx`, import.meta.url), "utf8");
      const lower = content.toLowerCase();
      for (const needle of forbiddenOrgNeedles()) expect(lower).not.toContain(needle.toLowerCase());
    }
  });
  it("keeps UNKNOWN as the locale-independent status token", () => {
    const docs = [documentation, readFileSync(new URL("./recoveryTaskCopy.ts", import.meta.url), "utf8")];
    for (const content of docs) {
      expect(content).toContain("UNKNOWN");
    }
  });
});
