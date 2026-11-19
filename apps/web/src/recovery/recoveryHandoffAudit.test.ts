import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { handoffCopy } from "./recoveryHandoffCopy";
import {
  HANDOFF_CONDITIONS, HANDOFF_DECISIONS, HANDOFF_LICENCES, HANDOFF_TIERS,
} from "./recoveryHandoff";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const ui = read("./RecoveryHandoffPanel.tsx");
const model = read("./recoveryHandoff.ts");
const copy = read("./recoveryHandoffCopy.ts");
const checked = [shell, barrel, ui, model, copy];

describe("recovery handoff live integration", () => {
  it("mounts the manual handoff panel in the live recovery shell", () => {
    expect(shell).toContain('import { RecoveryHandoffPanel } from "./RecoveryHandoffPanel"');
    expect(shell).toContain("<RecoveryHandoffPanel locale={locale}");
  });
  it("keeps the existing manual recovery attempts", () => {
    expect(shell).toContain("<RecoveryRepairAttempts locale={locale}");
  });
  it("keeps the failure checklist", () => {
    expect(shell).toContain("<RecoveryFailureChecklist locale={locale}");
  });
  it("keeps the provenance ledger", () => {
    expect(shell).toContain("<RecoveryProvenanceLedger locale={locale}");
  });
  it("keeps the case journal", () => {
    expect(shell).toContain("<RecoveryCaseJournal locale={locale}");
  });
  it("keeps the task board", () => {
    expect(shell).toContain("<RecoveryTaskBoard locale={locale}");
  });
  it("keeps the evidence notebook", () => {
    expect(shell).toContain("<RecoveryEvidenceNotebook locale={locale}");
  });
  it("keeps the dry-run panel", () => {
    expect(shell).toContain("<RecoveryDryRunPanel locale={locale}");
  });
  it("does not drop the original recovery plan review", () => {
    expect(shell).toContain("<RecoveryPlanReview locale={locale}");
  });
  it("exports the new component", () => {
    expect(barrel).toContain('export { RecoveryHandoffPanel } from "./RecoveryHandoffPanel"');
  });
  it("exports the new model and copy", () => {
    expect(barrel).toContain('from "./recoveryHandoff"');
    expect(barrel).toContain('from "./recoveryHandoffCopy"');
  });
  it("preserves error recovery public APIs", () => {
    for (const name of ["RecoveryNotice", "classifyRecoveryError", "classifyPackDownloadError", "runRecoverable"]) {
      expect(barrel).toContain(name);
    }
  });
  it("provides 44px control heights", () => {
    expect(ui).toContain("minHeight: 44");
  });
  it("provides 44px control widths", () => {
    expect(ui).toContain("minWidth: 44");
  });
  it("shows changed state in a live status region", () => {
    expect(ui).toContain('role="status"');
    expect(ui).toContain('aria-live="polite"');
  });
  it("does not introduce bare alerts", () => {
    expect(ui).not.toContain('role="alert"');
  });
  it("does not start hidden network activity", () => {
    for (const value of [model, ui, copy]) {
      expect(value).not.toContain("fetch(");
      expect(value).not.toContain("WebSocket(");
    }
  });
  it("does not start scheduled operations", () => {
    for (const value of [model, ui, copy]) {
      expect(value).not.toContain("setInterval(");
      expect(value).not.toContain("setTimeout(");
    }
  });
  it("does not include any prohibited organisation literal", () => {
    for (const forbidden of forbiddenOrgNeedles()) {
      for (const file of checked) expect(file.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
  it("never promotes a handoff decision into pack readiness", () => {
    expect(model).not.toContain("commitCheckedRegion(");
    expect(model).not.toContain("setPackReady(");
    expect(model).not.toContain("downloadRegion(");
  });
  it("preserves the UNKNOWN condition in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(handoffCopy(locale).conditions.UNKNOWN).toBe("UNKNOWN");
      expect(handoffCopy(locale).decisions.UNKNOWN).toBe("UNKNOWN");
      expect(handoffCopy(locale).tiers.UNKNOWN).toBe("UNKNOWN");
    }
  });
  it("keeps all outcome and tier enumerations covered in copy", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const outcome of HANDOFF_CONDITIONS) expect(handoffCopy(locale).conditions[outcome]).toBeTruthy();
      for (const decision of HANDOFF_DECISIONS) expect(handoffCopy(locale).decisions[decision]).toBeTruthy();
      for (const tier of HANDOFF_TIERS) expect(handoffCopy(locale).tiers[tier]).toBeTruthy();
    }
  });
  it("limits provenance to open licences", () => {
    expect(HANDOFF_LICENCES).toContain("CC0-1.0");
    expect(HANDOFF_LICENCES).toContain("ODbL-1.0");
    expect(HANDOFF_LICENCES).not.toContain("proprietary");
  });
  it("keeps required source properties", () => {
    for (const field of ["name", "licence", "date", "tier", "reference"]) {
      expect(model).toContain(`readonly ${field}:`);
    }
  });
  it("uses French nonbreaking punctuation for labels", () => {
    expect(ui).toContain('"\\u00a0: "');
  });
  it("uses appropriate French apostrophes", () => {
    expect(copy).toContain("L’");
    expect(copy).not.toContain("L'");
  });
  it("does not show forbidden assurance copy", () => {
    for (const locale of ["en", "fr"] as const) {
      const value = JSON.stringify(handoffCopy(locale));
      expect(value).not.toMatch(/\bverified\b|\bverify\b|vérif/i);
    }
  });
});
