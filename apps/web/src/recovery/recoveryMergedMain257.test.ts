import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");

const established = [
  "RecoveryEvidencePacketPanel", "RecoveryTransferWitnessPanel", "RecoveryHandoffChainPanel",
  "RecoveryReconciliationPanel", "RecoveryDrillPanel",
] as const;

describe("recovery integration on merged main 822d221d", () => {
  it("preserves every merged panel and adds the new one", () => {
    for (const name of [...established, "RecoveryReceiptLedgerPanel"]) {
      expect(shell).toContain(`await import("./${name}")`);
      expect(shell).toContain(`<${name} locale={locale}`);
      expect(barrel).toContain(`export { ${name} } from "./${name}"`);
    }
  });
  it("retains fresh inspection gating and download and export", () => {
    expect(shell).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
    expect(shell).toContain("session.start(download)");
    expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)");
  });
  it("retains the original notebook copy and the merged modules", () => {
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
    for (const name of ["recoveryHandoffChain", "recoveryDrillRun", "recoveryReconciliation", "recoveryEvidencePacket", "recoveryTransferWitness"]) {
      expect(barrel).toContain(`from "./${name}"`);
    }
  });
});
