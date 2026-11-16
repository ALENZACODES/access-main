import { forbiddenOrgNames } from "./forbiddenOrgNames";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planImportCopy } from "./recoveryPlanImport";
import { planComparisonCopy } from "./recoveryPlanCompare";
import { recoveryStepCopy } from "./recoveryPlanSteps";

const root = dirname(fileURLToPath(import.meta.url));
const modules = [
  "recoveryPlanImport.ts", "recoveryPlanCompare.ts", "recoveryPlanSteps.ts", "recoveryPlanDiffExport.ts", "RecoveryPlanReview.tsx",
];
const forbiddenCopy = /\b(?:verified|verify|vérifié|real-time|partnership|guarantee)\b/i;
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}
function allCopy(locale: "en" | "fr"): string[] {
  return [planImportCopy(locale), planComparisonCopy(locale), recoveryStepCopy(locale)].flatMap(strings);
}

describe("portable plan recovery safeguards", () => {
  it("fails if translated text contains unapproved claims", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const phrase of allCopy(locale)) {
        expect(phrase, `${locale}: ${phrase}`).not.toMatch(forbiddenCopy);
      }
    }
  });

  it("fails if organisation branding appears in source files", () => {
    for (const module of modules) {
      const source = readFileSync(join(root, module), "utf8");
      for (const needle of forbiddenOrgNames()) expect(source.toLowerCase()).not.toContain(needle);
    }
  });

  it("rejects scheduled jobs or direct network traffic", () => {
    for (const module of modules) {
      const source = readFileSync(join(root, module), "utf8");
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
      expect(source).not.toMatch(/setInterval\s*\(|cron\b|scheduleJob\s*\(/);
      expect(source).not.toMatch(/tile\.openstreetmap\.org|api\.mapbox\.com/);
    }
  });

  it("does not persist imported private notes", () => {
    for (const module of modules) {
      const source = readFileSync(join(root, module), "utf8");
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|navigator\.storage/);
      expect(source).not.toMatch(/\bdocument\.cookie\b/);
    }
  });

  it("wires the user-facing review into RecoveryCenter", () => {
    const shell = readFileSync(join(root, "RecoveryCenter.tsx"), "utf8");
    const index = readFileSync(join(root, "index.ts"), "utf8");
    const panel = readFileSync(join(root, "RecoveryPlanReview.tsx"), "utf8");
    expect(shell).toContain("<RecoveryPlanReview");
    expect(shell).toContain("planPackRepairs(inventory");
    expect(shell).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
    for (const module of ["recoveryPlanImport", "recoveryPlanCompare", "recoveryPlanSteps", "recoveryPlanDiffExport", "RecoveryPlanReview"]) {
      expect(index).toContain(`from "./${module}"`);
    }
    expect(panel).toContain("inspectRecoveryPlan(pendingText");
    expect(panel).toContain("compareRecoveryPlan(reviewed.document");
    expect(panel).toContain("buildRecoverySteps(comparison)");
    expect(panel).toContain("savePlanDiff(comparison, saveFile)");
    expect(panel).toContain("onInspect");
  });

  it("does not apply or install historical queue choices", () => {
    const panel = readFileSync(join(root, "RecoveryPlanReview.tsx"), "utf8");
    expect(panel).not.toMatch(/updateRecoveryBatch\s*\(|reconcileRecoveryBatch\s*\(/);
    expect(panel).not.toMatch(/saveLocalPlanExport\s*\(|PackDownloadSession\s*\(/);
    expect(panel).not.toMatch(/store\.(?:put|delete|set|write|remove)\s*\(/);
  });

  it("uses genuine native buttons and file input", () => {
    const panel = readFileSync(join(root, "RecoveryPlanReview.tsx"), "utf8");
    expect(panel).toContain('id={fileId} type="file"');
    expect(panel).toContain('<label htmlFor={fileId}>');
    expect(panel).toContain('aria-describedby={fileHintId}');
    expect(panel).toContain('<button type="button"');
    expect(panel).toContain('aria-expanded={expanded.includes(item.id)}');
    expect(panel).toContain('role="status" aria-live="polite"');
    expect(panel).toContain('<fieldset');
    expect(panel).toContain('<legend>');
  });

  it("maintains 44px minimum button and input targets", () => {
    const panel = readFileSync(join(root, "RecoveryPlanReview.tsx"), "utf8");
    expect(panel).toMatch(/const button: CSSProperties = \{[\s\S]*?minHeight: 44/);
    expect(panel).toMatch(/const field: CSSProperties = \{[^}]*minHeight: 44/);
    expect(panel).not.toMatch(/minHeight:\s*(?:[0-9]|[1-3][0-9])\b/);
    expect(panel).not.toMatch(/minWidth:\s*(?:[0-9]|[1-3][0-9])\b/);
  });

  it("uses typographic apostrophes in translated French strings", () => {
    for (const phrase of allCopy("fr")) {
      expect(phrase).not.toMatch(/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/);
    }
  });

  it("enforces French spacing near punctuation", () => {
    for (const phrase of allCopy("fr")) {
      expect(phrase).not.toMatch(/[^\u00a0]:/);
      expect(phrase).not.toMatch(/[^\u202f][;!?]/);
      expect(phrase).not.toMatch(/«[^\u202f]|[^\u202f]»/);
    }
  });

  it("ensures both translations distinguish UNKNOWN from a complete file", () => {
    expect(planComparisonCopy("en").unknown).toBe("UNKNOWN");
    expect(planComparisonCopy("fr").unknown).toBe("INCONNU");
    expect(recoveryStepCopy("en").incomplete).toContain("UNKNOWN");
    expect(recoveryStepCopy("fr").incomplete).toContain("INCONNUS");
  });

  it("requires provenance metadata for each imported source", () => {
    const parser = readFileSync(join(root, "recoveryPlanImport.ts"), "utf8");
    expect(parser).toContain("isOpenLicence(value.licence)");
    expect(parser).toContain("parseCalendarDate(value.date)");
    expect(parser).toContain("source-future");
    expect(parser).toContain("duplicate-id");
    expect(parser).toContain("unexpected-field");
  });

  it("limits file bytes before parsing", () => {
    const parser = readFileSync(join(root, "recoveryPlanImport.ts"), "utf8");
    const panel = readFileSync(join(root, "RecoveryPlanReview.tsx"), "utf8");
    expect(parser).toContain("new TextEncoder().encode(text).byteLength > byteLimit");
    expect(panel).toContain("selected.size > MAX_FILE_BYTES");
    expect(panel).toContain("new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES");
  });

  it("includes regression tests for each new stateful feature", () => {
    for (const name of ["recoveryPlanImport", "recoveryPlanCompare", "recoveryPlanSteps", "recoveryPlanDiffExport"]) {
      const test = readFileSync(join(root, `${name}.test.ts`), "utf8");
      expect(test).toContain('from "vitest"');
      expect(test).toContain(`from "./${name}"`);
      expect(test).toContain("describe(");
      expect(test).toContain("it(");
    }
  });
});
