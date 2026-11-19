import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { provenanceCopy } from "./recoveryProvenanceCopy";
import { LEDGER_VALUES, LEDGER_TIERS } from "./recoveryProvenanceLedger";

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const ui = read("./RecoveryProvenanceLedger.tsx");
const model = read("./recoveryProvenanceLedger.ts");
const copy = read("./recoveryProvenanceCopy.ts");
const attempts = read("./RecoveryRepairAttempts.tsx");
const testFiles = [
  "./recoveryProvenanceLedger.test.ts",
  "./recoveryProvenanceLedgerInvariant.test.ts",
];
const checked = [shell, barrel, ui, model, copy, attempts, ...testFiles.map(read)];

describe("reconciliation workspace integration audit", () => {
  it("mounts the new panel in the live recovery shell", () => {
    expect(shell).toContain('import { RecoveryProvenanceLedger } from "./RecoveryProvenanceLedger"');
    expect(shell).toContain("<RecoveryProvenanceLedger locale={locale}");
  });
  it("does not drop previously mounted recovery panels", () => {
    for (const component of [
      "RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview",
      "RecoveryEvidenceNotebook", "RecoveryDryRunPanel",
      "RecoveryCaseJournal", "RecoveryTaskBoard", "RecoveryRepairAttempts",
    ]) {
      expect(shell).toContain(`<${component}`);
    }
  });
  it("has matching public exports", () => {
    expect(barrel).toContain('export { RecoveryProvenanceLedger } from "./RecoveryProvenanceLedger"');
    expect(barrel).toContain('from "./recoveryProvenanceLedger"');
    expect(barrel).toContain('from "./recoveryProvenanceCopy"');
  });
  it("keeps existing public error-recovery exports", () => {
    for (const symbol of ["classifyRecoveryError", "classifyPackDownloadError", "runRecoverable", "RecoveryNotice"]) {
      expect(barrel).toContain(symbol);
    }
  });
  it("uses 44px minimum interactive controls", () => {
    expect(ui).toContain("minHeight: 44");
    expect(ui).toContain("minWidth: 44");
    expect(ui).toContain("style={controls}");
  });
  it("shows errors and changes in accessible status regions", () => {
    expect(ui).toContain('role="status"');
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain('role="alert"');
  });
  it("links every displayed section to a heading", () => {
    expect(ui).toContain("aria-labelledby={headingId}");
    expect(ui).toContain("aria-labelledby={resultsId}");
  });
  it("keeps local work separate from remote calls", () => {
    for (const item of [model, copy, ui]) {
      expect(item).not.toContain("fetch(");
      expect(item).not.toContain("WebSocket(");
      expect(item).not.toContain("setInterval(");
      expect(item).not.toContain("setTimeout(");
    }
  });
  it("does not include prohibited organisation names", () => {
    for (const needle of forbiddenOrgNeedles()) {
      for (const item of checked) expect(item.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
  it("does not make an unsupported accessibility claim", () => {
    for (const item of [model, copy, ui]) {
      expect(item).not.toMatch(/\baccessible location\b|\bguaranteed accessible\b/i);
    }
  });
  it("does not put prohibited assurance verbs into new interface copy", () => {
    for (const value of Object.values(provenanceCopy("en"))) {
      if (typeof value === "string") expect(value).not.toMatch(/\bverified\b|\bverify\b/i);
    }
    for (const value of Object.values(provenanceCopy("fr"))) {
      if (typeof value === "string") expect(value).not.toMatch(/vérif/i);
    }
  });
  it("always exposes UNKNOWN in both localizations", () => {
    expect(provenanceCopy("en").result.UNKNOWN).toBe("UNKNOWN");
    expect(provenanceCopy("fr").result.UNKNOWN).toBe("UNKNOWN");
    expect(provenanceCopy("en").tiers.UNKNOWN).toBe("UNKNOWN");
    expect(provenanceCopy("fr").tiers.UNKNOWN).toBe("UNKNOWN");
    expect(LEDGER_VALUES).toContain("UNKNOWN");
    expect(LEDGER_TIERS).toContain("UNKNOWN");
  });
  it("avoids the old French preview spacing", () => {
    expect(attempts).toContain('"\\u202F; "');
    expect(attempts).not.toContain('"new entries"}; {preview.value.conflicts.length}');
  });
  it("uses French nonbreaking punctuation before labels", () => {
    expect(ui).toContain('"\\u00a0: "');
    expect(copy).toContain("L’");
  });
  it("never promotes a source statement to pack readiness", () => {
    expect(model).not.toContain("setPackReady(");
    expect(model).not.toContain("commitCheckedRegion(");
    expect(model).not.toContain("downloadRegion(");
  });
  it("keeps source, licence, date and tier on each entry", () => {
    for (const item of ["name", "licence", "date", "tier", "reference"]) {
      expect(model).toContain(`readonly ${item}:`);
    }
  });
});
