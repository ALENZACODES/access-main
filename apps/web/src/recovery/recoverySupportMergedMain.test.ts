import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panels = [
  "RecoveryEvidencePacketPanel", "RecoveryTransferWitnessPanel", "RecoveryHandoffChainPanel",
  "RecoveryDrillPanel", "RecoveryReconciliationPanel", "RecoverySupportBriefPanel",
] as const;

describe("support briefs integrated with merged recovery shell", () => {
  it("keeps all established lazy mounts and adds the support brief", () => {
    for (const name of panels) {
      expect(shell).toContain(`await import("./${name}")`);
      expect(shell).toContain(`<${name} locale={locale}`);
      expect(barrel).toContain(`export { ${name} } from "./${name}"`);
    }
  });
  it("keeps inspection fail-closed on support briefs", () => {
    const start = shell.indexOf("<RecoverySupportBriefPanel locale={locale}");
    expect(start).toBeGreaterThan(-1);
    expect(shell.slice(start, shell.indexOf("/>", start))).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
  });
  it("retains existing notebook copy and handoff modules", () => {
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
    for (const name of ["recoveryHandoffChain", "recoveryDrillRun", "recoveryReconciliation", "recoveryEvidencePacket", "recoveryTransferWitness"]) {
      expect(barrel).toContain(`from "./${name}"`);
    }
  });
  it("keeps original manual download and local export", () => {
    expect(shell).toContain("session.start(download)");
    expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)");
  });
});
