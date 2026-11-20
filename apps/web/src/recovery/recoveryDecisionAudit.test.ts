import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { recoveryDecisionCopy } from "./recoveryDecisionCopy";
import { MATRIX_CONDITIONS, MATRIX_TIERS } from "./recoveryDecisionMatrix";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoveryDecisionMatrix.tsx");
const model = read("./recoveryDecisionMatrix.ts");
const coverage = read("./recoveryDecisionCoverage.ts");
const copy = read("./recoveryDecisionCopy.ts");
const tests = read("./recoveryDecisionMatrix.test.ts");
const coverageTests = read("./recoveryDecisionCoverage.test.ts");
const handoffTests = read("./recoveryHandoff.test.ts");
const checked = [shell, barrel, panel, model, coverage, copy, tests, coverageTests, handoffTests];

describe("live manual recovery matrix", () => {
  it("imports and mounts the new component on the live shell", () => {
    expect(shell).toContain('import { RecoveryDecisionMatrix } from "./RecoveryDecisionMatrix"');
    expect(shell).toContain("<RecoveryDecisionMatrix locale={locale}");
  });
  it("preserves the live pack recovery panel", () => {
    expect(shell).toContain("<RecoveryWorkbench");
    expect(shell).toContain("<RecoveryQueuePanel");
    expect(shell).toContain("<RecoveryPlanReview");
  });
  it("keeps the established local evidence panels", () => {
    expect(shell).toContain("<RecoveryEvidenceNotebook locale={locale}");
    expect(shell).toContain("<RecoveryDryRunPanel locale={locale}");
    expect(shell).toContain("<RecoveryCaseJournal locale={locale}");
    expect(shell).toContain("<RecoveryTaskBoard locale={locale}");
  });
  it("keeps the attempt and checklist panels", () => {
    expect(shell).toContain("<RecoveryRepairAttempts locale={locale}");
    expect(shell).toContain("<RecoveryFailureChecklist locale={locale}");
  });
  it("preserves source reconciliation and handoff", () => {
    expect(shell).toContain("<RecoveryProvenanceLedger locale={locale}");
    expect(shell).toContain("<RecoveryHandoffPanel locale={locale}");
  });
  it("keeps public error recovery exports", () => {
    for (const name of ["RecoveryNotice", "classifyRecoveryError", "classifyPackDownloadError", "runRecoverable"]) {
      expect(barrel).toContain(name);
    }
  });
  it("exports the new panel and its helpers", () => {
    expect(barrel).toContain('export { RecoveryDecisionMatrix } from "./RecoveryDecisionMatrix"');
    expect(barrel).toContain('from "./recoveryDecisionMatrix"');
    expect(barrel).toContain('from "./recoveryDecisionCoverage"');
    expect(barrel).toContain('from "./recoveryDecisionCopy"');
  });
  it("uses minimum 44px interactive controls", () => {
    expect(panel).toContain("minWidth: 44");
    expect(panel).toContain("minHeight: 44");
    expect(panel).toContain("style={control}");
  });
  it("labels the interface and its list region", () => {
    expect(panel).toContain("aria-labelledby={heading}");
    expect(panel).toContain("aria-labelledby={listHeading}");
  });
  it("announces changes politely", () => {
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
  });
  it("does not create unaccounted bare alerts", () => {
    expect(panel).not.toContain('role="alert"');
  });
  it("uses only user-controlled file transfers", () => {
    expect(panel).toContain("onChange=");
    expect(panel).toContain("onClick=");
    expect(panel).toContain("saveFile(");
  });
  it("does not schedule background operations", () => {
    for (const item of [model, panel, coverage, copy]) {
      expect(item).not.toContain("setInterval(");
      expect(item).not.toContain("setTimeout(");
      expect(item).not.toContain("WebSocket(");
      expect(item).not.toContain("fetch(");
    }
  });
  it("does not use dangerous storage or network APIs", () => {
    for (const item of [model, panel, coverage]) {
      expect(item).not.toContain("localStorage.");
      expect(item).not.toContain("indexedDB.");
      expect(item).not.toContain("deleteRegion(");
      expect(item).not.toContain("downloadRegion(");
    }
  });
  it("checks restricted names through the single shared helper", () => {
    for (const needle of forbiddenOrgNeedles()) {
      for (const item of checked) expect(item.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
  it("does not invent an assurance label in user copy", () => {
    const combined = JSON.stringify({ en: recoveryDecisionCopy("en"), fr: recoveryDecisionCopy("fr") });
    expect(combined).not.toMatch(/\bverified\b|\bverify\b|vérif/i);
  });
  it("keeps UNKNOWN literal in both languages", () => {
    expect(recoveryDecisionCopy("en").conditionNames.UNKNOWN).toBe("UNKNOWN");
    expect(recoveryDecisionCopy("fr").conditionNames.UNKNOWN).toBe("UNKNOWN");
    expect(recoveryDecisionCopy("en").tierNames.UNKNOWN).toBe("UNKNOWN");
    expect(recoveryDecisionCopy("fr").tierNames.UNKNOWN).toBe("UNKNOWN");
  });
  it("uses a proper French apostrophe", () => {
    expect(copy).toContain("L’");
    expect(copy).not.toContain("L'");
  });
  it("has a nonbreaking space before French colon labels", () => {
    expect(panel).toContain('"\\u00a0: "');
  });
  it("preserves the supported conditions", () => {
    expect(MATRIX_CONDITIONS).toContain("UNKNOWN");
    expect(MATRIX_TIERS).toContain("UNKNOWN");
  });
  it("keeps the new model independent of packs", () => {
    expect(model).not.toContain("commitCheckedRegion(");
    expect(model).not.toContain("setPackReady(");
  });
  it("does not write the prohibited local helper again", () => {
    for (const item of [model, coverage, copy, panel]) expect(item).not.toContain("fromCharCode");
  });
});
