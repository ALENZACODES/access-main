import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { sessionCopy } from "./recoverySessionCopy";

const load = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = load("./RecoveryCenter.tsx");
const barrel = load("./index.ts");
const component = load("./RecoverySessionTracePanel.tsx");
const model = load("./recoverySessionTrace.ts");
const analysis = load("./recoverySessionAnalysis.ts");
const copyFile = load("./recoverySessionCopy.ts");
const sources = [shell, barrel, component, model, analysis, copyFile];

describe("manual local session trace integration", () => {
  it("mounts the trace panel on the existing recovery shell", () => {
    expect(shell).toContain('import { RecoverySessionTracePanel } from "./RecoverySessionTracePanel"');
    expect(shell).toContain('<RecoverySessionTracePanel locale={locale}');
  });
  it("preserves the transfer preflight mount", () => {
    expect(shell).toContain('import { RecoveryTransferPreflight } from "./RecoveryTransferPreflight"');
    expect(shell).toContain('<RecoveryTransferPreflight locale={locale}');
  });
  it("preserves previous recovery panels", () => {
    for (const componentName of [
      "RecoveryWorkbench", "RecoveryQueuePanel", "RecoveryPlanReview", "RecoveryEvidenceNotebook",
      "RecoveryDryRunPanel", "RecoveryCaseJournal", "RecoveryTaskBoard", "RecoveryRepairAttempts",
      "RecoveryFailureChecklist", "RecoveryProvenanceLedger", "RecoveryHandoffPanel",
    ]) {
      expect(shell).toContain(`<${componentName}`);
    }
  });
  it("keeps required public error-recovery exports", () => {
    for (const name of ["RecoveryNotice", "classifyRecoveryError", "classifyPackDownloadError", "runRecoverable"]) {
      expect(barrel).toContain(name);
    }
  });
  it("keeps the complete transfer preflight API exports", () => {
    for (const name of ["RecoveryTransferPreflight", "recoveryTransferHistory", "recoveryTransferCopy"]) {
      expect(barrel).toContain(name);
    }
  });
  it("exports the session-trace model, analysis, and copy", () => {
    for (const name of ["RecoverySessionTracePanel", "recoverySessionTrace", "recoverySessionAnalysis", "recoverySessionCopy"]) {
      expect(barrel).toContain(name);
    }
  });
  it("has 44px touch targets", () => {
    expect(component).toContain("minHeight: 44");
    expect(component).toContain("minWidth: 44");
  });
  it("announces a local status politely", () => {
    expect(component).toContain('role="status"');
    expect(component).toContain('aria-live="polite"');
  });
  it("does not create bare error alerts", () => {
    expect(component).not.toContain('role="alert"');
  });
  it("does not start scheduled operations or hidden requests", () => {
    for (const code of [component, model, analysis]) {
      expect(code).not.toContain("setInterval(");
      expect(code).not.toContain("setTimeout(");
      expect(code).not.toContain("fetch(");
      expect(code).not.toContain("WebSocket(");
    }
  });
  it("does not include restricted names", () => {
    for (const needle of forbiddenOrgNeedles()) {
      for (const text of sources) expect(text.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
  it("preserves UNKNOWN in English and French", () => {
    expect(sessionCopy("en").outcomes.UNKNOWN).toBe("UNKNOWN");
    expect(sessionCopy("fr").outcomes.UNKNOWN).toBe("UNKNOWN");
    expect(sessionCopy("fr").tiers.UNKNOWN).toBe("UNKNOWN");
    expect(sessionCopy("fr").assessments.UNKNOWN).toBe("UNKNOWN");
    expect(sessionCopy("fr").assessments.documented).toBe("Notes consignées");
  });
  it("requires English and French copy for all headings", () => {
    expect(sessionCopy("en").heading.length > 0).toBe(true);
    expect(sessionCopy("fr").heading.length > 0).toBe(true);
    expect(sessionCopy("en").intro.length > 0).toBe(true);
    expect(sessionCopy("fr").intro.length > 0).toBe(true);
  });
  it("uses the French nonbreaking colon spacing", () => {
    expect(component).toContain('"\\u00a0: "');
  });
  it("does not claim an observation changed pack readiness", () => {
    for (const code of [component, model, analysis]) {
      expect(code).not.toContain("commitCheckedRegion(");
      expect(code).not.toContain("setPackReady(");
      expect(code).not.toContain("downloadRegion(");
    }
  });
  it("requires complete source, licence, date, and tier", () => {
    for (const name of ["readonly name:", "readonly licence:", "readonly date:", "readonly tier:"]) {
      expect(model).toContain(name);
    }
  });
});
