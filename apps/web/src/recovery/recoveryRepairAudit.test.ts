import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const shell = readFileSync(new URL("./RecoveryCenter.tsx", import.meta.url), "utf8");
const barrel = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("./RecoveryRepairAttempts.tsx", import.meta.url), "utf8");
const model = readFileSync(new URL("./recoveryRepairReceipt.ts", import.meta.url), "utf8");
const contents = [shell, barrel, panel, model];

describe("manual attempt integration", () => {
  it("preserves all five components", () => {
    for (const component of ["RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal", "RecoveryTaskBoard", "RecoveryRepairAttempts"]) {
      expect(shell).toContain(`<${component} locale={locale}`);
      expect(shell).toContain(`import { ${component} } from "./${component}"`);
    }
  });
  it("makes the new API available from the barrel", () => {
    expect(barrel).toContain('export { RecoveryRepairAttempts } from "./RecoveryRepairAttempts"');
    expect(barrel).toContain('from "./recoveryRepairReceipt"');
  });
  it("uses 44px or greater controls", () => {
    expect(panel).toContain("minHeight: 44");
    expect(panel).toContain("minWidth: 44");
  });
  it("uses the common prohibited-organisation helper", () => {
    for (const needle of forbiddenOrgNeedles()) {
      for (const value of contents) expect(value.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
  it("does not make scheduled or hidden network operations", () => {
    for (const value of contents) {
      expect(value).not.toContain("setInterval(");
      expect(value).not.toContain("fetch(");
    }
  });
  it("keeps the literal UNKNOWN in both languages", () => {
    expect(model).toContain('UNKNOWN');
    expect(panel).toContain('UNKNOWN');
  });
});
