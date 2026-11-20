import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoveryTransferWitnessPanel.tsx");
const model = read("./recoveryTransferWitness.ts");
const analysis = read("./recoveryTransferWitnessAnalysis.ts");
const copy = read("./recoveryTransferWitnessCopy.ts");
const modules = [model, analysis, copy, panel];
const existingPanels = [
  "RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview",
  "RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal",
  "RecoveryTaskBoard", "RecoveryRepairAttempts", "RecoveryTransferPreflight",
  "RecoveryFailureChecklist", "RecoveryProvenanceLedger", "RecoveryHandoffPanel",
  "RecoverySessionTracePanel", "RecoveryCheckpointPanel", "RecoveryDecisionMatrix",
] as const;

describe("live manual recovery transfer witness integration", () => {
  it("imports the new panel from its own file", () => {
    expect(shell).toContain('await import("./RecoveryTransferWitnessPanel")');
    expect(shell).toContain("<Suspense fallback=");
  });
  it("mounts the new panel in the live RecoveryCenter", () => {
    expect(shell).toContain("<RecoveryTransferWitnessPanel locale={locale} records={inventory}");
  });
  it("does not allow a stale inventory to count as inspected", () => {
    expect(shell).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
  });
  it("passes a caller-provided save operation", () => {
    expect(shell).toContain("saveFile={saveFile}");
  });
  it("preserves all established mounted recovery components", () => {
    for (const name of existingPanels) expect(shell).toContain(`<${name}`);
  });
  it("preserves all established component imports", () => {
    for (const name of existingPanels) expect(shell).toContain(`import { ${name} } from "./${name}";`);
  });
  it("keeps the existing retry/download entry point", () => {
    expect(shell).toContain("session.start(download)");
  });
  it("keeps the existing recovery export operation", () => {
    expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)");
  });
  it("exports the new panel from the barrel", () => {
    expect(barrel).toContain('export { RecoveryTransferWitnessPanel } from "./RecoveryTransferWitnessPanel"');
  });
  it("exports the panel props from the barrel", () => {
    expect(barrel).toContain('export type { RecoveryTransferWitnessPanelProps } from "./RecoveryTransferWitnessPanel"');
  });
  it("exports the witness document model", () => {
    expect(barrel).toContain('from "./recoveryTransferWitness"');
  });
  it("exports the witness analysis", () => {
    expect(barrel).toContain('from "./recoveryTransferWitnessAnalysis"');
  });
  it("exports the witness bilingual copy", () => {
    expect(barrel).toContain('from "./recoveryTransferWitnessCopy"');
  });
  it("retains existing Evidence Notebook localization", () => {
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
  });
  it("does not overwrite the Evidence Notebook copy", () => {
    expect(copy).not.toContain("export function evidenceCopy(");
  });
  it("retains transfer preflight exports", () => {
    expect(barrel).toContain('export { RecoveryTransferPreflight } from "./RecoveryTransferPreflight"');
  });
  it("retains handoff exports", () => {
    expect(barrel).toContain('export { RecoveryHandoffPanel } from "./RecoveryHandoffPanel"');
  });
  it("retains session trace exports", () => {
    expect(barrel).toContain('export { RecoverySessionTracePanel } from "./RecoverySessionTracePanel"');
  });
  it("retains checkpoint exports", () => {
    expect(barrel).toContain('export { RecoveryCheckpointPanel } from "./RecoveryCheckpointPanel"');
  });
  it("retains decision matrix exports", () => {
    expect(barrel).toContain('export { RecoveryDecisionMatrix } from "./RecoveryDecisionMatrix"');
  });
  it("uses a 44 pixel minimum touch target width", () => {
    expect(panel).toContain("minWidth: 44");
  });
  it("uses a 44 pixel minimum touch target height", () => {
    expect(panel).toContain("minHeight: 44");
  });
  it("uses a labelled heading", () => {
    expect(panel).toContain("aria-labelledby={heading}");
  });
  it("uses a labelled transfer list", () => {
    expect(panel).toContain("aria-labelledby={listHeading}");
  });
  it("announces local status changes politely", () => {
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
  });
  it("provides native keyboard controls", () => {
    expect(panel).toContain("<button");
    expect(panel).toContain("<input");
    expect(panel).toContain("<select");
  });
  it("requires explicit file selection", () => {
    expect(panel).toContain('type="file"');
    expect(panel).toContain("onChange=");
  });
  it("requires explicit saving", () => {
    expect(panel).toContain("saveFile(");
    expect(panel).toContain("onClick=");
  });
  it("limits the imported file size", () => {
    expect(panel).toContain("file.size > WITNESS_LIMITS.bytes");
  });
  it("does not silently resolve imported conflicts", () => {
    expect(panel).toContain("preview.conflicts.length > 0 || preview.eventConflicts.length > 0");
  });
  it("does not schedule work or keep the process awake", () => {
    for (const source of modules) {
      expect(source).not.toContain("setInterval(");
      expect(source).not.toContain("setTimeout(");
      expect(source).not.toContain("WebSocket(");
    }
  });
  it("does not contact services to infer transfer facts", () => {
    for (const source of modules) expect(source).not.toContain("fetch(");
  });
  it("does not write implicit browser storage", () => {
    for (const source of modules) {
      expect(source).not.toContain("localStorage.setItem(");
      expect(source).not.toContain("indexedDB.open(");
    }
  });
  it("does not delete installed regions", () => {
    expect(panel).not.toContain("deleteRegion(");
  });
  it("does not automatically download regions", () => {
    expect(panel).not.toContain("downloadRegion(");
  });
  it("never infers that an acknowledgement authorizes use", () => {
    expect(analysis).toContain("contentReady: false");
    expect(model).toContain("witnessContentReady");
  });
  it("always retains source and licence in records", () => {
    expect(model).toContain("readonly licence: string");
    expect(model).toContain("readonly retrievedOn: string");
  });
  it("does not use regex ranges of forbidden control characters", () => {
    expect(model).not.toContain("\\u0000-\\u0008");
    expect(model).toContain("charCodeAt(i)");
  });
  it("does not translate UNKNOWN to a category", () => {
    expect(copy).toContain('unknown: "UNKNOWN"');
  });
  it("keeps French nonbreaking colon spacing", () => {
    expect(panel).toContain('"\\u00a0: "');
  });
});
