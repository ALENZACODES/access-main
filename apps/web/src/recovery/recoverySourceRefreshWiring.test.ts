import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { REFRESH_LIMITS } from "./recoverySourceRefresh";
import { recoverySourceRefreshCopy } from "./recoverySourceRefreshCopy";
const read = (file: string): string => readFileSync(new URL(file, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoverySourceRefreshPanel.tsx");
const model = read("./recoverySourceRefresh.ts");
const analysis = read("./recoverySourceRefreshAnalysis.ts");
const copy = read("./recoverySourceRefreshCopy.ts");
const feature = [panel, model, analysis, copy];

const established = [
  "RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal",
  "RecoveryTaskBoard", "RecoveryRepairAttempts", "RecoveryTransferPreflight",
  "RecoveryFailureChecklist", "RecoveryProvenanceLedger", "RecoveryHandoffPanel",
  "RecoverySessionTracePanel", "RecoveryCheckpointPanel", "RecoveryDecisionMatrix",
  "RecoveryEvidencePacketPanel", "RecoveryTransferWitnessPanel", "RecoveryHandoffChainPanel",
  "RecoveryReconciliationPanel", "RecoveryDrillPanel", "RecoveryReceiptLedgerPanel",
] as const;

describe("source review lives in the recovery shell without clobbering other features", () => {
  it("loads the source refresh panel through a separate chunk", () => {
    expect(shell).toContain('await import("./RecoverySourceRefreshPanel")');
  });
  it("retains a nonempty localized loading fallback", () => {
    expect(shell).toContain("Loading source review…");
    expect(shell).toContain("Chargement de l’examen des sources…");
  });
  it("mounts the panel with current pack inventory", () => {
    expect(shell).toContain('<RecoverySourceRefreshPanel locale={locale} records={inventory}');
  });
  it("gates the panel on fresh inspection", () => {
    const start = shell.indexOf("<RecoverySourceRefreshPanel locale={locale}");
    const fragment = shell.slice(start, shell.indexOf("/>", start));
    expect(fragment).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
  });
  it("supplies manual inspection and caller-controlled saving", () => {
    expect(shell).toContain('onInspect={() => { void refresh(); }} saveFile={saveFile}');
  });
  it("preserves every earlier mounted feature", () => {
    for (const name of established) expect(shell).toContain(`<${name} locale={locale}`);
  });
  it("retains original pack inspection", () => { expect(shell).toContain("inspectInstalledPacks(store)"); });
  it("retains original download operation", () => { expect(shell).toContain("session.start(download)"); });
  it("retains original pack export operation", () => { expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)"); });
  it("retains the original notebook copy API", () => { expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"'); });
  it("retains packet, witness and handoff-chain exports", () => {
    for (const name of ["RecoveryEvidencePacketPanel", "RecoveryTransferWitnessPanel", "RecoveryHandoffChainPanel"]) {
      expect(barrel).toContain(`export { ${name} } from "./${name}"`);
    }
  });
  it("retains drill and reconciliation exports", () => {
    for (const name of ["RecoveryDrillPanel", "RecoveryReconciliationPanel"]) {
      expect(barrel).toContain(`export { ${name} } from "./${name}"`);
    }
  });
  it("retains ReceiptLedger exports", () => { expect(barrel).toContain('export { RecoveryReceiptLedgerPanel } from "./RecoveryReceiptLedgerPanel"'); });
  it("exports the new source refresh panel", () => { expect(barrel).toContain('export { RecoverySourceRefreshPanel } from "./RecoverySourceRefreshPanel"'); });
  it("exports all new source refresh modules", () => {
    for (const name of ["recoverySourceRefresh", "recoverySourceRefreshAnalysis", "recoverySourceRefreshCopy"]) {
      expect(barrel).toContain(`from "./${name}"`);
    }
  });
  it("keeps minimum 44px touch targets", () => { expect(panel).toContain("minHeight: 44"); expect(panel).toContain("minWidth: 44"); });
  it("keeps form controls inside small viewports", () => { expect(panel).toContain('gridTemplateColumns: "minmax(0, 1fr)"'); expect(panel).toContain('maxWidth: "100%"'); });
  it("bounds local JSON uploads", () => { expect(panel).toContain("file.size > REFRESH_LIMITS.bytes"); expect(REFRESH_LIMITS.bytes).toBeLessThanOrEqual(524288); });
  it("uses a named main landmark", () => { expect(panel).toContain("aria-labelledby={heading}"); });
  it("uses a distinct review region name", () => { expect(panel).toContain('aria-labelledby={`${heading} ${reviewHeading}`}'); });
  it("uses a distinct list region name", () => { expect(panel).toContain('aria-labelledby={`${heading} ${listHeading}`}'); });
  it("uses accessible native controls", () => { expect(panel).toContain("<button"); expect(panel).toContain("<input"); expect(panel).toContain("<select"); });
  it("announces user actions politely", () => { expect(panel).toContain('role="status" aria-live="polite"'); });
  it("retains user-initiated file selection", () => { expect(panel).toContain('type="file"'); expect(panel).toContain("onChange="); });
  it("blocks conflicting imports from automatic merge", () => { expect(panel).toContain('disabled={!preview.canMerge}'); });
  it("uses the configured save function for local exports", () => { expect(panel).toContain("await saveFile("); });
  it("does not perform remote fetches", () => { for (const item of feature) expect(item).not.toContain("fetch("); });
  it("does not modify browser storage", () => { for (const item of feature) expect(item).not.toContain("localStorage.setItem("); });
  it("does not use scheduled background work", () => {
    for (const item of feature) { expect(item).not.toContain("setTimeout("); expect(item).not.toContain("setInterval("); expect(item).not.toContain("WebSocket("); }
  });
  it("does not modify installed packs", () => { for (const item of feature) expect(item).not.toContain("deleteRegion("); });
  it("keeps unknown claims as UNKNOWN", () => { expect(recoverySourceRefreshCopy("en").unknown).toBe("UNKNOWN"); expect(recoverySourceRefreshCopy("fr").unknown).toBe("UNKNOWN"); });
  it("uses a human-selected rather than scheduled review window", () => { expect(panel).toContain("setWindowDays("); });
  it("keeps the new source and UI free of restricted organisation references", () => {
    for (const item of [...feature, shell, barrel]) for (const needle of forbiddenOrgNeedles()) {
      expect(item.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
});
