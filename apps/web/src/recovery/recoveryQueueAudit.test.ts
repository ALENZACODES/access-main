import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recoveryBatchCopy } from "./recoveryBatch";
import { recoveryLedgerCopy } from "./recoveryLedger";
import { planExportCopy } from "./recoveryPlanExport";
import { repairPolicyCopy } from "./recoveryPolicy";

const root = dirname(fileURLToPath(import.meta.url));
const modules = [
  "recoveryPolicy.ts", "recoveryLedger.ts", "recoveryBatch.ts",
  "recoveryPlanExport.ts", "RecoveryQueuePanel.tsx",
];
const prohibitedCopy = /\b(?:verified|verify|vérifié|real-time|partnership|guarantee|sciontario)\b/i;
const externalLocation = /(?:https?:\/\/|tile\.openstreetmap\.org|api\.mapbox\.com)/i;
const scheduledWork = /(?:setInterval\s*\(|cron\b|scheduleJob\s*\()/;

function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(stringsOf);
  }
  return [];
}

function allCopy(locale: "en" | "fr"): string[] {
  return [
    repairPolicyCopy(locale), recoveryBatchCopy(locale),
    recoveryLedgerCopy(locale), planExportCopy(locale),
  ].flatMap(stringsOf);
}

describe("recovery queue policy audits", () => {
  it("does not include prohibited user claims in any translated copy", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const phrase of allCopy(locale)) {
        expect(phrase, `${locale}: ${phrase}`).not.toMatch(prohibitedCopy);
      }
    }
  });

  it("does not include organisation names or claims in new sources", () => {
    for (const name of modules) {
      const content = readFileSync(join(root, name), "utf8");
      expect(content).not.toMatch(/\bSCIO\b|sciontario|Spinal Cord Injury Ontario/i);
      expect(content).not.toMatch(/AAA-conformant/i);
    }
  });

  it("contains no hidden third-party tiles or URL-based data acquisition", () => {
    for (const name of modules) {
      const content = readFileSync(join(root, name), "utf8");
      expect(content, name).not.toMatch(externalLocation);
      expect(content, name).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
    }
  });

  it("does not schedule unattended operations", () => {
    for (const name of modules) {
      const content = readFileSync(join(root, name), "utf8");
      expect(content, name).not.toMatch(scheduledWork);
    }
  });

  it("keeps new modules attached to the live recovery shell", () => {
    const shell = readFileSync(join(root, "RecoveryCenter.tsx"), "utf8");
    const panel = readFileSync(join(root, "RecoveryQueuePanel.tsx"), "utf8");
    const index = readFileSync(join(root, "index.ts"), "utf8");
    expect(shell).toContain("<RecoveryQueuePanel");
    expect(shell).toContain("saveFile={saveFile}");
    for (const moduleName of ["recoveryPolicy", "recoveryBatch", "recoveryLedger", "recoveryPlanExport"]) {
      expect(index).toContain(`from "./${moduleName}"`);
    }
    expect(index).toContain('from "./RecoveryQueuePanel"');
    expect(panel).toContain("planPackRepairs(");
    expect(panel).toContain("createRecoveryBatch(");
    expect(panel).toContain("reconcileRecoveryBatch(");
    expect(panel).toContain("appendLedgerEvent(");
    expect(panel).toContain("saveLocalPlanExport(");
  });

  it("enforces 44 CSS pixel or larger buttons and text fields", () => {
    const panel = readFileSync(join(root, "RecoveryQueuePanel.tsx"), "utf8");
    expect(panel).toMatch(/const button: CSSProperties = \{[\s\S]*?minHeight: 44/);
    expect(panel).toMatch(/const field: CSSProperties = \{[\s\S]*?minHeight: 44/);
    expect(panel).toContain('minHeight: 44, alignItems: "center"');
    expect(panel).not.toMatch(/minHeight:\s*(?:[0-9]|[1-3][0-9])\b/);
    expect(panel).not.toMatch(/minWidth:\s*(?:[0-9]|[1-3][0-9])\b/);
  });

  it("uses native buttons, field labels and status announcements", () => {
    const panel = readFileSync(join(root, "RecoveryQueuePanel.tsx"), "utf8");
    expect(panel).toContain('<button type="button"');
    expect(panel).toContain('<label htmlFor={quotaId}>');
    expect(panel).toContain('aria-describedby={quotaHelpId}');
    expect(panel).toContain('aria-invalid={parsedQuota === "invalid"}');
    expect(panel).toContain('role="status" aria-live="polite"');
    expect(panel).toContain('role="alert"');
    expect(panel).toContain('<fieldset');
    expect(panel).toContain('<legend>');
  });

  it("disallows plain ASCII apostrophes in French user copy", () => {
    for (const phrase of allCopy("fr")) {
      expect(phrase).not.toMatch(/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/);
    }
  });

  it("enforces French nonbreaking punctuation spacing", () => {
    for (const phrase of allCopy("fr")) {
      expect(phrase).not.toMatch(/[^\u00a0]:/);
      expect(phrase).not.toMatch(/[^\u202f][;!?]/);
      expect(phrase).not.toMatch(/«[^\u202f]|[^\u202f]»/);
    }
  });

  it("keeps UNKNOWN outcomes explicit in both languages", () => {
    expect(recoveryBatchCopy("en").stages.unknown).toContain("UNKNOWN");
    expect(recoveryBatchCopy("fr").stages.unknown).toContain("INCONNU");
    expect(recoveryLedgerCopy("en").outcomes.unknown).toContain("UNKNOWN");
    expect(recoveryLedgerCopy("fr").outcomes.unknown).toContain("INCONNU");
    expect(repairPolicyCopy("en").flags.unknown).toContain("UNKNOWN");
    expect(repairPolicyCopy("fr").flags.unknown).toContain("INCONNU");
  });

  it("retains source, licence and date in the plan entry model", () => {
    const source = readFileSync(join(root, "recoveryPlanExport.ts"), "utf8");
    expect(source).toContain("readonly name: string;");
    expect(source).toContain("readonly licence: string;");
    expect(source).toContain("readonly date: string;");
    expect(source).toContain("isOpenLicence(source.licence)");
    expect(source).toContain("parseCalendarDate(source.date)");
  });

  it("does not add background persistence or browser storage", () => {
    for (const name of modules) {
      const content = readFileSync(join(root, name), "utf8");
      expect(content).not.toMatch(/localStorage|sessionStorage|indexedDB|navigator\.storage/);
    }
  });

  it("includes dedicated regression tests for each new source module", () => {
    for (const name of ["recoveryPolicy", "recoveryBatch", "recoveryLedger", "recoveryPlanExport"]) {
      const test = readFileSync(join(root, `${name}.test.ts`), "utf8");
      expect(test).toContain('from "vitest"');
      expect(test).toContain(`from "./${name}"`);
      expect(test).toContain("describe(");
      expect(test).toContain("it(");
    }
  });
});
