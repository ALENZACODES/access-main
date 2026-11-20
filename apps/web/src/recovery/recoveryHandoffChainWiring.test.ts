import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { CHAIN_LIMITS } from "./recoveryHandoffChain";
import { recoveryHandoffChainCopy } from "./recoveryHandoffChainCopy";
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoveryHandoffChainPanel.tsx");
const model = read("./recoveryHandoffChain.ts");
const analysis = read("./recoveryHandoffChainAnalysis.ts");
const plan = read("./recoveryHandoffChainPlan.ts");
const copy = read("./recoveryHandoffChainCopy.ts");
const source = [panel, model, analysis, plan, copy];
const olderPanels = [
  "RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal",
  "RecoveryTaskBoard", "RecoveryRepairAttempts", "RecoveryTransferPreflight",
  "RecoveryFailureChecklist", "RecoveryProvenanceLedger", "RecoveryHandoffPanel",
  "RecoverySessionTracePanel", "RecoveryCheckpointPanel", "RecoveryDecisionMatrix",
] as const;

describe("local handoff chain live integration", () => {
  it("imports new panel lazily", () => { expect(shell).toContain('await import("./RecoveryHandoffChainPanel")'); });
  it("keeps Suspense fallback", () => { expect(shell).toContain("<Suspense fallback="); });
  it("mounts actual handoff chain panel", () => { expect(shell).toContain("<RecoveryHandoffChainPanel locale={locale} records={inventory}"); });
  it("gates new panel on fresh inspection", () => { expect(shell).toContain("inspected={hasInspected && !checking && !inventoryFailure} saveFile={saveFile}"); });
  it("keeps the transfer preflight mount", () => { expect(shell).toContain("<RecoveryTransferPreflight locale={locale}"); });
  it("keeps the existing handoff panel", () => { expect(shell).toContain("<RecoveryHandoffPanel locale={locale}"); });
  it("keeps session trace", () => { expect(shell).toContain("<RecoverySessionTracePanel locale={locale}"); });
  it("keeps checkpoint panel", () => { expect(shell).toContain("<RecoveryCheckpointPanel locale={locale}"); });
  it("keeps decision matrix", () => { expect(shell).toContain("<RecoveryDecisionMatrix locale={locale}"); });
  it("keeps every older panel imported", () => {
    for (const name of olderPanels) expect(shell).toContain(`import { ${name} } from "./${name}";`);
  });
  it("keeps every older panel mounted", () => {
    for (const name of olderPanels) expect(shell).toContain(`<${name}`);
  });
  it("retains refresh", () => { expect(shell).toContain("inspectInstalledPacks(store)"); });
  it("retains manual download", () => { expect(shell).toContain("session.start(download)"); });
  it("retains manual export", () => { expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)"); });
  it("retains original workbench", () => { expect(shell).toContain("<RecoveryWorkbench"); });
  it("retains original queue", () => { expect(shell).toContain("<RecoveryQueuePanel"); });
  it("retains plan review", () => { expect(shell).toContain("<RecoveryPlanReview"); });
  it("retains original notice", () => { expect(shell).toContain("<RecoveryNotice"); });
  it("keeps notebook copy export untouched", () => { expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"'); });
  it("exports the new React panel", () => { expect(barrel).toContain('export { RecoveryHandoffChainPanel } from "./RecoveryHandoffChainPanel"'); });
  it("exports the new panel props", () => { expect(barrel).toContain('export type { RecoveryHandoffChainPanelProps } from "./RecoveryHandoffChainPanel"'); });
  it("exports the new model", () => { expect(barrel).toContain('export * from "./recoveryHandoffChain"'); });
  it("exports new analysis", () => { expect(barrel).toContain('export * from "./recoveryHandoffChainAnalysis"'); });
  it("exports the new manual plan", () => { expect(barrel).toContain('export * from "./recoveryHandoffChainPlan"'); });
  it("exports the new copy", () => { expect(barrel).toContain('export { recoveryHandoffChainCopy } from "./recoveryHandoffChainCopy"'); });
  it("keeps original classification exports", () => { expect(barrel).toContain("classifyRecoveryError"); });
  it("keeps the previous transfer preflight export", () => { expect(barrel).toContain('export { RecoveryTransferPreflight } from "./RecoveryTransferPreflight"'); });
  it("keeps previous decision matrix export", () => { expect(barrel).toContain('export { RecoveryDecisionMatrix } from "./RecoveryDecisionMatrix"'); });
  it("keeps previous handoff export", () => { expect(barrel).toContain('export { RecoveryHandoffPanel } from "./RecoveryHandoffPanel"'); });
  it("has 44px minimum control dimensions", () => { expect(panel).toContain("minHeight: 44"); expect(panel).toContain("minWidth: 44"); });
  it("uses real buttons rather than click-only non-controls", () => { expect(panel).toContain("<button"); });
  it("uses labelled inputs", () => { expect(panel).toContain("<label"); });
  it("uses native select controls", () => { expect(panel).toContain("<select"); });
  it("has a polite status region", () => { expect(panel).toContain('aria-live="polite"'); });
  it("labels the live section", () => { expect(panel).toContain("aria-labelledby={heading}"); });
  it("labels the list region", () => { expect(panel).toContain("aria-labelledby={listHeading}"); });
  it("keeps manual file input", () => { expect(panel).toContain('type="file"'); });
  it("allows explicit import only", () => { expect(panel).toContain("onChange={(event) => { void chooseFile(event); }}"); });
  it("validates import byte bound", () => { expect(panel).toContain("file.size > CHAIN_LIMITS.bytes"); });
  it("does not overwrite conflicting imports", () => { expect(panel).toContain("mergeChainDocuments(document, staged)"); });
  it("allows only caller-supplied save", () => { expect(panel).toContain("await saveFile("); });
  it("does not mutate installed packs", () => { expect(panel).not.toContain("deleteRegion("); expect(panel).not.toContain("commitCheckedRegion("); });
  it("never schedules polling", () => { for (const item of source) expect(item).not.toContain("setInterval("); });
  it("never schedules delayed jobs", () => { for (const item of source) expect(item).not.toContain("setTimeout("); });
  it("does not open network sockets", () => { for (const item of source) expect(item).not.toContain("WebSocket("); });
  it("does not fetch remote data", () => { for (const item of source) expect(item).not.toContain("fetch("); });
  it("does not write hidden local storage", () => { for (const item of source) expect(item).not.toContain("localStorage.setItem("); });
  it("does not create hidden IndexedDB", () => { for (const item of source) expect(item).not.toContain("indexedDB.open("); });
  it("does not include restricted organisation identifiers or prohibited assurances", () => {
    for (const item of source) {
      for (const needle of forbiddenOrgNeedles()) {
        expect(item.toLowerCase()).not.toContain(needle.toLowerCase());
      }
      expect(item).not.toMatch(/\bverified\b|\bguarantee\b|\bpartnership\b/i);
    }
  });
  it("never invents pack readiness", () => { expect(analysis).toContain("contentReady: false"); expect(plan).toContain("contentReady: false"); });
  it("preserves UNKNOWN in both languages", () => { expect(recoveryHandoffChainCopy("en").unknown).toBe("UNKNOWN"); expect(recoveryHandoffChainCopy("fr").unknown).toBe("UNKNOWN"); });
  it("uses bilingual source metadata", () => { expect(copy).toContain("retrievedOn"); expect(copy).toContain("licence"); });
  it("has a bounded import", () => { expect(CHAIN_LIMITS.bytes).toBeLessThanOrEqual(1_000_000); });
});

// Regression: preserve the two features already included on the base branch.
describe("merged recovery packet and witness preservation", () => {
  it("keeps both lazy-loaded components in the live recovery shell", () => {
    for (const name of ["RecoveryEvidencePacketPanel", "RecoveryTransferWitnessPanel"]) {
      expect(shell).toContain(`await import("./${name}")`);
      expect(shell).toContain(`<${name} locale={locale}`);
    }
  });
  it("keeps their fresh-inspection gates and file callbacks", () => {
    for (const name of ["RecoveryEvidencePacketPanel", "RecoveryTransferWitnessPanel"]) {
      const start = shell.indexOf(`<${name} locale={locale}`);
      expect(start).toBeGreaterThan(-1);
      const end = shell.indexOf("/>", start);
      expect(shell.slice(start, end)).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
      expect(shell.slice(start, end)).toContain("saveFile={saveFile}");
    }
  });
  it("keeps both panel, model, analysis and copy exports", () => {
    for (const name of ["RecoveryEvidencePacketPanel", "RecoveryTransferWitnessPanel"]) {
      expect(barrel).toContain(`export { ${name} } from "./${name}"`);
    }
    for (const name of ["recoveryEvidencePacket", "recoveryEvidenceAnalysis", "recoveryEvidencePacketCopy", "recoveryTransferWitness", "recoveryTransferWitnessAnalysis", "recoveryTransferWitnessCopy"]) {
      expect(barrel).toContain(`from "./${name}"`);
    }
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
  });
});
