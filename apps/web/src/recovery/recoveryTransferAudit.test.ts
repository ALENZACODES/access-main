import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { recoveryTransferCopy } from "./recoveryTransferCopy";
import { EVIDENCE_TIERS, TRANSFER_CONDITIONS, TRANSFER_KINDS, TRANSFER_STAGES } from "./recoveryTransferPreflight";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoveryTransferPreflight.tsx");
const model = read("./recoveryTransferPreflight.ts");
const timeline = read("./recoveryTransferHistory.ts");
const copy = read("./recoveryTransferCopy.ts");
const source = [shell, barrel, panel, model, timeline, copy];

describe("local recovery transfer preflight integration", () => {
  it("mounts the new panel in the existing recovery shell", () => {
    expect(shell).toContain('import { RecoveryTransferPreflight } from "./RecoveryTransferPreflight"');
    expect(shell).toContain("<RecoveryTransferPreflight locale={locale}");
  });
  it("preserves the existing workbench", () => {
    expect(shell).toContain("<RecoveryWorkbench");
  });
  it("preserves the queue", () => {
    expect(shell).toContain("<RecoveryQueuePanel");
  });
  it("preserves local plan review", () => {
    expect(shell).toContain("<RecoveryPlanReview");
  });
  it("preserves the evidence notebook", () => {
    expect(shell).toContain("<RecoveryEvidenceNotebook");
  });
  it("preserves the storage dry-run panel", () => {
    expect(shell).toContain("<RecoveryDryRunPanel");
  });
  it("preserves the case journal", () => {
    expect(shell).toContain("<RecoveryCaseJournal");
  });
  it("preserves the manual task board", () => {
    expect(shell).toContain("<RecoveryTaskBoard");
  });
  it("preserves the repair attempt component", () => {
    expect(shell).toContain("<RecoveryRepairAttempts");
  });
  it("retains existing package error exports", () => {
    for (const name of ["classifyRecoveryError", "classifyPackDownloadError", "runRecoverable", "RecoveryNotice"]) {
      expect(barrel).toContain(name);
    }
  });
  it("exports the new panel and its public contract", () => {
    expect(barrel).toContain('export { RecoveryTransferPreflight } from "./RecoveryTransferPreflight"');
    expect(barrel).toContain('from "./recoveryTransferPreflight"');
  });
  it("exports the new history API", () => {
    expect(barrel).toContain('from "./recoveryTransferHistory"');
  });
  it("exports bilingual message copy", () => {
    expect(barrel).toContain('from "./recoveryTransferCopy"');
  });
  it("uses 44px or larger controls", () => {
    expect(panel).toContain("minWidth: 44");
    expect(panel).toContain("minHeight: 44");
  });
  it("announces manual action results politely", () => {
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
  });
  it("does not introduce a new bare alert", () => {
    expect(panel).not.toContain('role="alert"');
  });
  it("connects each main section to a heading", () => {
    expect(panel).toContain("aria-labelledby={headingId}");
    expect(panel).toContain("aria-labelledby={resultsId}");
  });
  it("does not perform background transfers", () => {
    for (const value of [panel, model, timeline]) {
      expect(value).not.toContain("fetch(");
      expect(value).not.toContain("setInterval(");
      expect(value).not.toContain("WebSocket(");
    }
  });
  it("contains no prohibited organisation names", () => {
    for (const needle of forbiddenOrgNeedles()) {
      for (const value of source) expect(value.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
  it("never claims that local notes establish physical access", () => {
    for (const value of [panel, model, timeline, copy]) {
      expect(value).not.toContain("guaranteed accessible");
      expect(value).not.toContain("certified accessible");
    }
  });
  it("uses an explicit UNKNOWN value in both locales", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(recoveryTransferCopy(locale).conditions.unknown).toBe("UNKNOWN");
      expect(recoveryTransferCopy(locale).tiers.UNKNOWN).toBe("UNKNOWN");
      expect(recoveryTransferCopy(locale).decisions.UNKNOWN).toBe("UNKNOWN");
    }
  });
  it("has EN and FR labels for every operation", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const kind of TRANSFER_KINDS) expect(recoveryTransferCopy(locale).kinds[kind].length).toBeGreaterThan(0);
    }
  });
  it("has EN and FR labels for every reported condition", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const condition of TRANSFER_CONDITIONS) expect(recoveryTransferCopy(locale).conditions[condition].length).toBeGreaterThan(0);
    }
  });
  it("has EN and FR labels for every review stage", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const stage of TRANSFER_STAGES) expect(recoveryTransferCopy(locale).stages[stage].length).toBeGreaterThan(0);
    }
  });
  it("has EN and FR labels for every evidence tier", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const tier of EVIDENCE_TIERS) expect(recoveryTransferCopy(locale).tiers[tier].length).toBeGreaterThan(0);
    }
  });
  it("uses French nonbreaking punctuation for labels", () => {
    expect(panel).toContain('"\\u00a0: "');
    expect(copy).toContain("L’");
  });
  it("does not include prohibited assurance wording in user copy", () => {
    for (const value of Object.values(recoveryTransferCopy("en"))) {
      if (typeof value === "string") expect(value).not.toMatch(/\bverified\b|\bverify\b/i);
    }
    for (const value of Object.values(recoveryTransferCopy("fr"))) {
      if (typeof value === "string") expect(value).not.toMatch(/vérif/i);
    }
  });
});
