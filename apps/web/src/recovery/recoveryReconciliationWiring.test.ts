import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconciliationCopy } from "./recoveryReconciliationCopy";
import { RECONCILIATION_LIMITS } from "./recoveryReconciliation";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const ui = read("./RecoveryReconciliationPanel.tsx");
const model = read("./recoveryReconciliation.ts");
const analysis = read("./recoveryReconciliationAnalysis.ts");
const copy = read("./recoveryReconciliationCopy.ts");
const source = [ui, model, analysis, copy];
const earlier = [
  "RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview", "RecoveryEvidenceNotebook",
  "RecoveryDryRunPanel", "RecoveryCaseJournal", "RecoveryTaskBoard", "RecoveryRepairAttempts",
  "RecoveryTransferPreflight", "RecoveryFailureChecklist", "RecoveryProvenanceLedger",
  "RecoveryHandoffPanel", "RecoverySessionTracePanel", "RecoveryCheckpointPanel",
  "RecoveryDecisionMatrix",
] as const;

describe("reconciliation live mounts and public APIs", () => {
  it("imports the reconciliation UI from the real shell", () => {
    expect(shell).toContain('await import("./RecoveryReconciliationPanel")');
  });
  it("mounts with current inventory data", () => {
    expect(shell).toContain('<RecoveryReconciliationPanel locale={locale} records={inventory}');
  });
  it("supplies fresh inspection state", () => {
    expect(shell).toContain('inspected={hasInspected && !checking && !inventoryFailure}');
  });
  it("supplies the user-invoked inspection handler", () => {
    expect(shell).toContain('onInspect={() => { void refresh(); }} saveFile={saveFile}');
  });
  it("preserves every already mounted feature", () => {
    for (const name of earlier) expect(shell).toContain(`<${name}`);
  });
  it("preserves the original pack download path", () => {
    expect(shell).toContain("session.start(download)");
  });
  it("preserves the original local pack export", () => {
    expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)");
  });
  it("keeps the original pack inspection", () => {
    expect(shell).toContain("inspectInstalledPacks(store)");
  });
  it("exports a complete panel", () => {
    expect(barrel).toContain('export { RecoveryReconciliationPanel } from "./RecoveryReconciliationPanel"');
  });
  it("exports the panel props", () => {
    expect(barrel).toContain('export type { RecoveryReconciliationPanelProps } from "./RecoveryReconciliationPanel"');
  });
  it("exports the model APIs", () => {
    expect(barrel).toContain('from "./recoveryReconciliation"');
  });
  it("exports analysis APIs", () => {
    expect(barrel).toContain('from "./recoveryReconciliationAnalysis"');
  });
  it("exports bilingual copy", () => {
    expect(barrel).toContain('export { reconciliationCopy } from "./recoveryReconciliationCopy"');
  });
  it("retains existing evidence copy API without replacement", () => {
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
  });
  it("preserves transfer preflight exports", () => {
    expect(barrel).toContain('export { RecoveryTransferPreflight } from "./RecoveryTransferPreflight"');
  });
  it("preserves handoff exports", () => {
    expect(barrel).toContain('export { RecoveryHandoffPanel } from "./RecoveryHandoffPanel"');
  });
  it("preserves session trace exports", () => {
    expect(barrel).toContain('export { RecoverySessionTracePanel } from "./RecoverySessionTracePanel"');
  });
  it("preserves checkpoint exports", () => {
    expect(barrel).toContain('export { RecoveryCheckpointPanel } from "./RecoveryCheckpointPanel"');
  });
  it("preserves decision matrix exports", () => {
    expect(barrel).toContain('export { RecoveryDecisionMatrix } from "./RecoveryDecisionMatrix"');
  });
  it("keeps minimum 44px touch targets", () => {
    expect(ui).toContain("minWidth: 44");
    expect(ui).toContain("minHeight: 44");
    expect(ui).toContain("style={control}");
  });
  it("announces manual changes politely", () => {
    expect(ui).toContain('role="status"');
    expect(ui).toContain('aria-live="polite"');
  });
  it("provides proper semantic headings", () => {
    expect(ui).toContain("aria-labelledby={heading}");
    expect(ui).toContain("aria-labelledby={casesHeading}");
    expect(ui).toContain("aria-labelledby={findingsHeading}");
  });
  it("uses native controls for keyboard access", () => {
    expect(ui).toContain("<button");
    expect(ui).toContain("<input");
    expect(ui).toContain("<select");
    expect(ui).toContain("<fieldset");
  });
  it("provides English and French languages", () => {
    expect(ui).toContain("lang={locale}");
  });
  it("requires intentional local file selection", () => {
    expect(ui).toContain('type="file"');
    expect(ui).toContain("onChange=");
    expect(ui).toContain("chooseFile(event)");
  });
  it("limits selected file size", () => {
    expect(ui).toContain("file.size > RECONCILIATION_LIMITS.bytes");
    expect(RECONCILIATION_LIMITS.bytes).toBeLessThanOrEqual(524288);
  });
  it("requires a manual merge decision", () => {
    expect(ui).toContain("preview.canMerge");
    expect(ui).toContain("mergeReconciliationDocuments(document, staged)");
  });
  it("prevents pending conflicts from being accepted", () => {
    expect(ui).toContain('disabled={!preview.canMerge}');
  });
  it("uses only supplied save callbacks", () => {
    expect(ui).toContain("await saveFile(");
    expect(ui).not.toContain("showSaveFilePicker(");
  });
  it("does not erase installed packs", () => {
    for (const content of source) expect(content).not.toContain("deleteRegion(");
  });
  it("does not write direct browser storage", () => {
    for (const content of source) {
      expect(content).not.toContain("localStorage.setItem(");
      expect(content).not.toContain("indexedDB.open(");
    }
  });
  it("does not call remote network APIs", () => {
    for (const content of source) {
      expect(content).not.toContain("fetch(");
      expect(content).not.toContain("XMLHttpRequest(");
      expect(content).not.toContain("WebSocket(");
    }
  });
  it("does not schedule periodic work", () => {
    for (const content of source) {
      expect(content).not.toContain("setInterval(");
      expect(content).not.toContain("setTimeout(");
      expect(content).not.toContain("cron(");
    }
  });
  it("has no prohibited organisation names in new code", () => {
    for (const needle of forbiddenOrgNeedles()) {
      for (const content of source) expect(content.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
  it("keeps UNKNOWN in both locales", () => {
    expect(reconciliationCopy("en").unknown).toBe("UNKNOWN");
    expect(reconciliationCopy("fr").unknown).toBe("UNKNOWN");
  });
  it("uses French no-break spacing in reports", () => {
    expect(analysis).toContain("\\u00a0:");
  });
  it("uses French no-break labels in the live panel", () => {
    expect(ui).toContain("\\u00a0: ");
  });
  it("never creates a physical pack ready state", () => {
    expect(model).toContain("reconciliationContentReady");
    expect(model).toContain("return false;");
  });
  it("retains original, supplied source fields", () => {
    for (const name of ["name", "licence", "retrievedOn", "tier", "reference"]) {
      expect(model).toContain(`readonly ${name}:`);
    }
  });
  it("does not invent public accessibility observations", () => {
    expect(model).not.toContain("isAccessible: true");
    expect(analysis).not.toContain("accessible: true");
  });
  it("does not mislabel missing source as trusted", () => {
    expect(model).toContain('return failure("source")');
    expect(model).toContain('"UNKNOWN"');
  });
  it("does not make empty notes into source references", () => {
    expect(model).toContain("value.reference.trim().length === 0");
  });
});
