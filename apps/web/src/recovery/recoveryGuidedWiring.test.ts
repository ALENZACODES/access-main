import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoveryGuidedReviewPanel.tsx");
const model = read("./recoveryGuidedReview.ts");
const analysis = read("./recoveryGuidedAnalysis.ts");
const copy = read("./recoveryGuidedCopy.ts");
const newCode = [panel, model, analysis, copy];
const existingPanels = [
  "RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal",
  "RecoveryTaskBoard", "RecoveryRepairAttempts", "RecoveryTransferPreflight",
  "RecoveryFailureChecklist", "RecoveryProvenanceLedger", "RecoveryHandoffPanel",
  "RecoverySessionTracePanel", "RecoveryCheckpointPanel", "RecoveryDecisionMatrix",
  "RecoveryEvidencePacketPanel", "RecoveryTransferWitnessPanel", "RecoveryHandoffChainPanel",
] as const;
describe("guided local review live integration", () => {
  it("loads the panel in a separate chunk", () => {
    expect(shell).toContain('await import("./RecoveryGuidedReviewPanel")');
  });
  it("uses an accessible loading state", () => {
    expect(shell).toContain("<Suspense fallback=");
  });
  it("mounts the new panel with current pack inventory", () => {
    expect(shell).toContain("<RecoveryGuidedReviewPanel locale={locale} records={inventory}");
  });
  it("keeps the live inspection gate", () => {
    const i = shell.indexOf("<RecoveryGuidedReviewPanel locale={locale}");
    expect(i).toBeGreaterThan(-1);
    expect(shell.slice(i, shell.indexOf("/>", i))).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
  });
  it("supplies a manual reinspection control", () => {
    expect(shell).toContain("onInspect={() => { void refresh(); }} saveFile={saveFile}");
  });
  it("keeps existing recovery panels mounted", () => {
    for (const name of existingPanels) expect(shell).toContain(`<${name}`);
  });
  it("keeps original pack download behaviour", () => {
    expect(shell).toContain("session.start(download)");
  });
  it("keeps original local pack export", () => {
    expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)");
  });
  it("does not overwrite existing notebook copy", () => {
    expect(barrel).toContain('export { evidenceCopy } from "./recoveryEvidenceCopy"');
  });
  it("keeps evidence packet exports", () => {
    expect(barrel).toContain('export { RecoveryEvidencePacketPanel } from "./RecoveryEvidencePacketPanel"');
  });
  it("keeps transfer witness exports", () => {
    expect(barrel).toContain('export { RecoveryTransferWitnessPanel } from "./RecoveryTransferWitnessPanel"');
  });
  it("keeps handoff chain exports", () => {
    expect(barrel).toContain('export { RecoveryHandoffChainPanel } from "./RecoveryHandoffChainPanel"');
  });
  it("exports guided panel", () => {
    expect(barrel).toContain('export { RecoveryGuidedReviewPanel } from "./RecoveryGuidedReviewPanel"');
  });
  it("exports guided model", () => {
    expect(barrel).toContain('from "./recoveryGuidedReview"');
  });
  it("exports guided analysis", () => {
    expect(barrel).toContain('from "./recoveryGuidedAnalysis"');
  });
  it("exports guided bilingual copy", () => {
    expect(barrel).toContain('export { recoveryGuidedCopy } from "./recoveryGuidedCopy"');
  });
  it("uses native interactive controls", () => {
    expect(panel).toContain("<button");
    expect(panel).toContain("<input");
    expect(panel).toContain("<select");
    expect(panel).toContain("<fieldset");
  });
  it("names the main feature section", () => {
    expect(panel).toContain("aria-labelledby={heading}");
  });
  it("names the review queue", () => {
    expect(panel).toContain("aria-labelledby={queueHeading}");
  });
  it("has a polite announcement region", () => {
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
  });
  it("has 44px minimum target dimensions", () => {
    expect(panel).toContain("minHeight: 44");
    expect(panel).toContain("minWidth: 44");
  });
  it("prevents narrow screen horizontal expansion", () => {
    expect(panel).toContain('gridTemplateColumns: "minmax(0, 1fr)"');
    expect(panel).toContain('maxWidth: "100%"');
    expect(panel).toContain('boxSizing: "border-box"');
  });
  it("has a bounded local import", () => {
    expect(panel).toContain("file.size > GUIDED_LIMITS.bytes");
  });
  it("makes local import explicitly user-directed", () => {
    expect(panel).toContain('type="file"');
    expect(panel).toContain("onChange=");
  });
  it("previews conflicts before accepting imports", () => {
    expect(panel).toContain("previewGuidedMerge(document, staged)");
    expect(panel).toContain("disabled={!preview.canMerge}");
  });
  it("exports through caller-supplied saver only", () => {
    expect(panel).toContain("await saveFile(");
  });
  it("never changes installed pack readiness", () => {
    expect(model).toContain("guidedContentReady");
    expect(analysis).toContain("contentReady: false");
  });
  it("has English and French copy", () => {
    expect(copy).toContain("const en: GuidedCopy");
    expect(copy).toContain("const fr: GuidedCopy");
  });
  it("does not silently translate UNKNOWN", () => {
    expect(copy).toContain('unknown: "UNKNOWN"');
  });
  it("does not schedule background operations", () => {
    for (const item of newCode) { expect(item).not.toContain("setInterval("); expect(item).not.toContain("setTimeout("); }
  });
  it("does not call network services", () => {
    for (const item of newCode) { expect(item).not.toContain("fetch("); expect(item).not.toContain("XMLHttpRequest("); }
  });
  it("does not write browser storage silently", () => {
    for (const item of newCode) { expect(item).not.toContain("localStorage.setItem("); expect(item).not.toContain("indexedDB.open("); }
  });
  it("does not include restricted organisation names", () => {
    for (const item of newCode) for (const needle of forbiddenOrgNeedles()) expect(item.toLowerCase()).not.toContain(needle.toLowerCase());
  });
});
