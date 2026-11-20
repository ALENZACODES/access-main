import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";
import { recoveryCheckpointCopy } from "./recoveryCheckpointCopy";
import {
  CHECKPOINT_CONDITIONS, CHECKPOINT_OPERATIONS, CHECKPOINT_TIERS,
} from "./recoveryCheckpoint";
const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
const shell = read("./RecoveryCenter.tsx");
const barrel = read("./index.ts");
const panel = read("./RecoveryCheckpointPanel.tsx");
const model = read("./recoveryCheckpoint.ts");
const analysis = read("./recoveryCheckpointAnalysis.ts");
const timeline = read("./recoveryCheckpointTimeline.ts");
const copy = read("./recoveryCheckpointCopy.ts");
const source = [panel, model, analysis, timeline, copy];

describe("local checkpoint live integration", () => {
  it("imports the new component from the live shell", () => {
    expect(shell).toContain('import { RecoveryCheckpointPanel } from "./RecoveryCheckpointPanel"');
  });
  it("mounts the new panel with active inspection state", () => {
    expect(shell).toContain("<RecoveryCheckpointPanel locale={locale} records={inventory}");
    expect(shell).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
  });
  it("does not remove the recovery workbench", () => {
    expect(shell).toContain("<RecoveryWorkbench");
  });
  it("does not remove the recovery queue", () => {
    expect(shell).toContain("<RecoveryQueuePanel");
  });
  it("does not remove the recovery plan review", () => {
    expect(shell).toContain("<RecoveryPlanReview");
  });
  it("keeps the evidence notebook", () => {
    expect(shell).toContain("<RecoveryEvidenceNotebook");
  });
  it("keeps the dry-run panel", () => {
    expect(shell).toContain("<RecoveryDryRunPanel");
  });
  it("keeps the case journal", () => {
    expect(shell).toContain("<RecoveryCaseJournal");
  });
  it("keeps the task board", () => {
    expect(shell).toContain("<RecoveryTaskBoard");
  });
  it("keeps the repair-attempt panel", () => {
    expect(shell).toContain("<RecoveryRepairAttempts");
  });
  it("keeps transfer preflight", () => {
    expect(shell).toContain("<RecoveryTransferPreflight");
  });
  it("retains the original download control", () => {
    expect(shell).toContain("session.start(download)");
  });
  it("retains the original export control", () => {
    expect(shell).toContain("saveRecoveryExport(records, createdAt, saveFile)");
  });
  it("exports the new component", () => {
    expect(barrel).toContain('export { RecoveryCheckpointPanel } from "./RecoveryCheckpointPanel"');
  });
  it("exports the new model and history modules", () => {
    expect(barrel).toContain('from "./recoveryCheckpoint"');
    expect(barrel).toContain('from "./recoveryCheckpointAnalysis"');
    expect(barrel).toContain('from "./recoveryCheckpointTimeline"');
  });
  it("preserves existing error exports", () => {
    for (const name of ["classifyRecoveryError", "classifyPackDownloadError", "runRecoverable", "RecoveryNotice"]) {
      expect(barrel).toContain(name);
    }
  });
  it("keeps explicit minimum touch targets", () => {
    expect(panel).toContain("minHeight: 44");
    expect(panel).toContain("minWidth: 44");
    expect(panel).toContain("style={touch}");
  });
  it("announces changes politely", () => {
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
  });
  it("does not create an unlisted bare error alert", () => {
    expect(panel).not.toContain('role="alert"');
  });
  it("has no scheduled background actions", () => {
    for (const content of source) {
      expect(content).not.toContain("setInterval(");
      expect(content).not.toContain("setTimeout(");
      expect(content).not.toContain("WebSocket(");
    }
  });
  it("has no hidden network calls", () => {
    for (const content of source) expect(content).not.toContain("fetch(");
  });
  it("has no direct browser storage mutation", () => {
    for (const content of source) {
      expect(content).not.toContain("localStorage.setItem(");
      expect(content).not.toContain("indexedDB.open(");
    }
  });
  it("keeps every organization needle out of the new code", () => {
    for (const needle of forbiddenOrgNeedles()) {
      for (const content of source) expect(content.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
  it("keeps the literal UNKNOWN in both languages", () => {
    expect(recoveryCheckpointCopy("en").unknown).toBe("UNKNOWN");
    expect(recoveryCheckpointCopy("fr").unknown).toBe("UNKNOWN");
    expect(recoveryCheckpointCopy("en").conditions.UNKNOWN).toBe("UNKNOWN");
    expect(recoveryCheckpointCopy("fr").conditions.UNKNOWN).toBe("UNKNOWN");
  });
  it("does not rewrite an unknown condition as another category", () => {
    expect(CHECKPOINT_CONDITIONS).toContain("UNKNOWN");
    expect(CHECKPOINT_TIERS).toContain("UNKNOWN");
    expect(CHECKPOINT_OPERATIONS).toEqual(["pack", "download", "export"]);
  });
  it("keeps supplied source, licence, date and tier per entry", () => {
    for (const key of ["name", "licence", "date", "tier", "reference"]) {
      expect(model).toContain(`readonly ${key}:`);
    }
  });
  it("does not claim any recorded checkpoint authorizes pack use", () => {
    expect(analysis).toContain("contentReady: false");
    expect(timeline).toContain("contentReady: false");
  });
  it("has the French narrow space before the semicolon", () => {
    expect(panel).toContain('"\\u202F; "');
  });
  it("uses French nonbreaking spacing before labels", () => {
    expect(panel).toContain('"\\u00a0: "');
  });
  it("avoids prohibited assurance copy", () => {
    for (const localized of [recoveryCheckpointCopy("en"), recoveryCheckpointCopy("fr")]) {
      for (const part of Object.values(localized)) {
        if (typeof part !== "string") continue;
        expect(part).not.toMatch(/\bverified\b|\bverify\b|vérif/i);
      }
    }
  });
});
