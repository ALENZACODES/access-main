import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { RECEIPT_LIMITS } from "./recoveryReceiptLedger";
import { recoveryReceiptCopy } from "./recoveryReceiptCopy";

const read = (file: string): string => readFileSync(new URL(file, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoveryReceiptLedgerPanel.tsx");
const model = read("./recoveryReceiptLedger.ts");
const analysis = read("./recoveryReceiptAnalysis.ts");
const copy = read("./recoveryReceiptCopy.ts");
const feature = [panel, model, analysis, copy];
const established = [
  "RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview",
  "RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal",
  "RecoveryTaskBoard", "RecoveryRepairAttempts", "RecoveryTransferPreflight",
  "RecoveryFailureChecklist", "RecoveryProvenanceLedger", "RecoveryHandoffPanel",
  "RecoverySessionTracePanel", "RecoveryCheckpointPanel", "RecoveryDecisionMatrix",
] as const;

describe("live recovery receipt integration", () => {
  it("loads the receipt panel in a separate chunk", () => { expect(shell).toContain('await import("./RecoveryReceiptLedgerPanel")'); });
  it("retains a local loading fallback", () => { expect(shell).toContain("<Suspense fallback="); });
  it("mounts the new panel against live inventory", () => { expect(shell).toContain('<RecoveryReceiptLedgerPanel locale={locale} records={inventory}'); });
  it("gates new receipts on a successful local inspection", () => { expect(shell).toContain('inspected={hasInspected && !checking && !inventoryFailure}'); });
  it("supplies only caller-provided save capability", () => { expect(shell).toContain('onInspect={() => { void refresh(); }} saveFile={saveFile}'); });
  it("preserves the earlier live panels", () => { for (const name of established) expect(shell).toContain(`<${name}`); });
  it("preserves the earlier imports", () => { for (const name of established) expect(shell).toContain(`import { ${name} } from "./${name}"`); });
  it("retains original inspection", () => { expect(shell).toContain("inspectInstalledPacks(store)"); });
  it("retains original download", () => { expect(shell).toContain("session.start(download)"); });
  it("retains original local report export", () => { expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)"); });
  it("preserves notice error handling", () => { expect(shell).toContain("<RecoveryNotice"); });
  it("exports the receipt panel", () => { expect(barrel).toContain('export { RecoveryReceiptLedgerPanel } from "./RecoveryReceiptLedgerPanel"'); });
  it("exports panel prop types", () => { expect(barrel).toContain('export type { RecoveryReceiptLedgerPanelProps } from "./RecoveryReceiptLedgerPanel"'); });
  it("exports receipt model", () => { expect(barrel).toContain('from "./recoveryReceiptLedger"'); });
  it("exports analysis functions", () => { expect(barrel).toContain('from "./recoveryReceiptAnalysis"'); });
  it("exports bilingual copy", () => { expect(barrel).toContain('export { recoveryReceiptCopy } from "./recoveryReceiptCopy"'); });
  it("preserves original notebook copy", () => { expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"'); });
  it("preserves recovery error classification", () => { expect(barrel).toContain("classifyRecoveryError"); });
  it("preserves transfer preflight exports", () => { expect(barrel).toContain('export { RecoveryTransferPreflight } from "./RecoveryTransferPreflight"'); });
  it("preserves session trace exports", () => { expect(barrel).toContain('export { RecoverySessionTracePanel } from "./RecoverySessionTracePanel"'); });
  it("preserves handoff panel exports", () => { expect(barrel).toContain('export { RecoveryHandoffPanel } from "./RecoveryHandoffPanel"'); });
  it("preserves checkpoint exports", () => { expect(barrel).toContain('export { RecoveryCheckpointPanel } from "./RecoveryCheckpointPanel"'); });
  it("preserves decision matrix exports", () => { expect(barrel).toContain('export { RecoveryDecisionMatrix } from "./RecoveryDecisionMatrix"'); });
  it("enforces minimum 44px controls", () => { expect(panel).toContain("minHeight: 44"); expect(panel).toContain("minWidth: 44"); });
  it("uses native keyboard-operable buttons", () => { expect(panel).toContain("<button"); });
  it("uses native select controls", () => { expect(panel).toContain("<select"); });
  it("uses explicitly labelled input controls", () => { expect(panel).toContain("<label"); });
  it("provides a polite live region", () => { expect(panel).toContain('aria-live="polite"'); });
  it("provides a section heading", () => { expect(panel).toContain("aria-labelledby={heading}"); });
  it("provides a list heading", () => { expect(panel).toContain("aria-labelledby={listHeading}"); });
  it("requires manual file selection", () => { expect(panel).toContain('type="file"'); });
  it("limits the file size before reading it", () => { expect(panel).toContain("file.size > RECEIPT_LIMITS.bytes"); });
  it("requires an explicit merge action", () => { expect(panel).toContain("mergeReceiptDocuments(document, staged)"); });
  it("does not auto-accept conflicting imports", () => { expect(panel).toContain("disabled={!preview.canMerge}"); });
  it("uses the supplied save callback", () => { expect(panel).toContain("await saveFile("); });
  it("does not remove installed pack data", () => { for (const item of feature) expect(item).not.toContain("deleteRegion("); });
  it("does not commit installed pack readiness", () => { for (const item of feature) expect(item).not.toContain("commitCheckedRegion("); });
  it("does not write hidden local storage", () => { for (const item of feature) expect(item).not.toContain("localStorage.setItem("); });
  it("does not directly open IndexedDB", () => { for (const item of feature) expect(item).not.toContain("indexedDB.open("); });
  it("does not schedule polling", () => { for (const item of feature) expect(item).not.toContain("setInterval("); });
  it("does not schedule timers", () => { for (const item of feature) expect(item).not.toContain("setTimeout("); });
  it("does not open network sockets", () => { for (const item of feature) expect(item).not.toContain("WebSocket("); });
  it("does not fetch remote data", () => { for (const item of feature) expect(item).not.toContain("fetch("); });
  it("contains no restricted organisation names", () => {
    for (const item of [...feature, shell, barrel]) for (const needle of forbiddenOrgNeedles()) {
      expect(item.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
  it("never invents pack readiness", () => { expect(model).toContain("receiptContentReady"); expect(analysis).toContain("contentReady: false"); });
  it("preserves UNKNOWN in both languages", () => { expect(recoveryReceiptCopy("en").unknown).toBe("UNKNOWN"); expect(recoveryReceiptCopy("fr").unknown).toBe("UNKNOWN"); });
  it("uses bilingual source metadata", () => { expect(copy).toContain("retrievedOn"); expect(copy).toContain("licence"); });
  it("preserves bounded imports", () => { expect(RECEIPT_LIMITS.bytes).toBeLessThanOrEqual(512000); });
});
