import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRILL_LIMITS } from "./recoveryDrillRun";
const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoveryDrillPanel.tsx");
const model = read("./recoveryDrillRun.ts");
const analysis = read("./recoveryDrillAnalysis.ts");
const copy = read("./recoveryDrillCopy.ts");
const source = [panel, model, analysis, copy];
const retained = [
  "RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview",
  "RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal",
  "RecoveryTaskBoard", "RecoveryRepairAttempts", "RecoveryTransferPreflight",
  "RecoveryFailureChecklist", "RecoveryProvenanceLedger", "RecoveryHandoffPanel",
  "RecoverySessionTracePanel", "RecoveryCheckpointPanel", "RecoveryDecisionMatrix",
];

describe("manual offline rehearsal integration", () => {
  it("loads its panel in a distinct chunk", () => {
    expect(shell).toContain('await import("./RecoveryDrillPanel")');
  });
  it("mounts the rehearsal panel visibly", () => {
    expect(shell).toContain("<RecoveryDrillPanel locale={locale} records={inventory}");
  });
  it("uses a polite loading state", () => {
    expect(shell).toContain("<Suspense fallback=");
    expect(shell).toContain('role="status" aria-live="polite"');
  });
  it("does not accept stale inventory inspections", () => {
    const start = shell.indexOf("<RecoveryDrillPanel locale={locale}");
    expect(shell.slice(start, shell.indexOf("/>", start))).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
  });
  it("supplies the caller-controlled file save API", () => {
    expect(shell).toContain("inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile} />");
  });
  it("exports the component from recovery barrel", () => {
    expect(barrel).toContain('export { RecoveryDrillPanel } from "./RecoveryDrillPanel"');
  });
  it("exports the component prop type", () => {
    expect(barrel).toContain('export type { RecoveryDrillPanelProps } from "./RecoveryDrillPanel"');
  });
  it("exports the schema model", () => {
    expect(barrel).toContain('from "./recoveryDrillRun"');
  });
  it("exports the evidence analysis", () => {
    expect(barrel).toContain('from "./recoveryDrillAnalysis"');
  });
  it("exports bilingual copy", () => {
    expect(barrel).toContain('export { recoveryDrillCopy } from "./recoveryDrillCopy"');
  });
  it("retains every existing recovery panel", () => {
    for (const name of retained) expect(shell).toContain(`<${name}`);
  });
  it("retains standard imports for recovery panels", () => {
    for (const name of retained) expect(shell).toContain(`import { ${name} } from "./${name}"`);
  });
  it("retains transfer preflight mount", () => {
    expect(shell).toContain("<RecoveryTransferPreflight locale={locale}");
  });
  it("retains human handoff mount", () => {
    expect(shell).toContain("<RecoveryHandoffPanel locale={locale}");
  });
  it("retains session trace mount", () => {
    expect(shell).toContain("<RecoverySessionTracePanel locale={locale}");
  });
  it("retains checkpoint mount", () => {
    expect(shell).toContain("<RecoveryCheckpointPanel locale={locale}");
  });
  it("retains decision matrix mount", () => {
    expect(shell).toContain("<RecoveryDecisionMatrix locale={locale}");
  });
  it("retains the original manual download operation", () => {
    expect(shell).toContain("session.start(download)");
  });
  it("retains the original export operation", () => {
    expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)");
  });
  it("preserves local notebook copy exports", () => {
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
  });
  it("does not collide with notebook copy symbol", () => {
    expect(copy).toContain("export function recoveryDrillCopy");
    expect(copy).not.toContain("export function evidenceCopy");
  });
  it("keeps source files out of the network path", () => {
    for (const text of source) expect(text).not.toContain("fetch(");
  });
  it("does not schedule periodic background work", () => {
    for (const text of source) {
      expect(text).not.toContain("setInterval(");
      expect(text).not.toContain("setTimeout(");
      expect(text).not.toContain("WebSocket(");
    }
  });
  it("does not mutate installed packs", () => {
    for (const text of source) {
      expect(text).not.toContain("deleteRegion(");
      expect(text).not.toContain("commitCheckedRegion(");
      expect(text).not.toContain("setPackReady(");
    }
  });
  it("does not open storage implicitly", () => {
    for (const text of source) {
      expect(text).not.toContain("indexedDB.open(");
      expect(text).not.toContain("localStorage.setItem(");
    }
  });
  it("uses a visible status announcement", () => {
    expect(panel).toContain('role="status" aria-live="polite"');
  });
  it("labels the panel with an explicit heading", () => {
    expect(panel).toContain("aria-labelledby={heading}");
  });
  it("labels the recorded cases with another heading", () => {
    expect(panel).toContain("aria-labelledby={`${heading} ${listHeading}`}");
  });
  it("requires at least 44px tap targets", () => {
    expect(panel).toContain("minHeight: 44");
    expect(panel).toContain("minWidth: 44");
  });
  it("uses native keyboard-operable buttons", () => {
    expect(panel).toContain('<button type="button"');
  });
  it("uses native keyboard-operable select controls", () => {
    expect(panel).toContain("<select");
  });
  it("uses user-selected bounded files", () => {
    expect(panel).toContain('type="file"');
    expect(panel).toContain("file.size > DRILL_LIMITS.bytes");
    expect(DRILL_LIMITS.bytes).toBeLessThanOrEqual(1_000_000);
  });
  it("requires explicit inspected pack for recording", () => {
    expect(panel).toContain("!inspected || !packs.includes(chosen.packId)");
  });
  it("does not infer successful pack usability", () => {
    expect(model).toContain("drillContentReady(): false");
    expect(analysis).toContain("contentReady: false");
  });
  it("retains UNKNOWN through UI defaults", () => {
    expect(panel).toContain('useState<DrillOutcome>("UNKNOWN")');
    expect(copy).toContain('unknown: "UNKNOWN"');
  });
  it("keeps source metadata mandatory", () => {
    for (const property of ["source", "licence", "retrievedOn", "tier", "reference"]) {
      expect(model).toContain(`readonly ${property}:`);
    }
  });
  it("keeps import conflicts visible", () => {
    expect(panel).toContain("preview.runConflicts > 0 || preview.stepConflicts > 0 || preview.eventConflicts > 0");
  });
  it("uses the caller-provided save API", () => {
    expect(panel).toContain('saveFile("recovery-drill-run.json", result.value)');
  });
  it("prevents unrequested file exports", () => {
    expect(panel).toContain("if (!saveFile || busy) return;");
  });
  it("does not add organization endorsement language", () => {
    expect(JSON.stringify(source)).not.toMatch(/endorsed by|partnered with|official partner|guarantee/i);
  });
});
