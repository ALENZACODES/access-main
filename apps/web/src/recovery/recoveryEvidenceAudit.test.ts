import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";
import { evidenceCopy } from "./recoveryEvidenceCopy";

const recoveryFiles = [
  "./recoveryEvidenceNotebook.ts",
  "./recoveryEvidenceCopy.ts",
  "./RecoveryEvidenceNotebook.tsx",
  "./recoveryEvidenceNotebook.test.ts",
  "./RecoveryCenter.tsx",
  "./RECOVERY_EVIDENCE_NOTEBOOK.md",
] as const;

function source(filename: string): string {
  return readFileSync(new URL(filename, import.meta.url), "utf8");
}

describe("recovery notebook quality gates", () => {
  it("is mounted in the live recovery shell", () => {
    const shell = source("./RecoveryCenter.tsx");
    expect(shell).toContain('import { RecoveryEvidenceNotebook } from "./RecoveryEvidenceNotebook";');
    expect(shell).toContain("<RecoveryEvidenceNotebook locale={locale} saveFile={saveFile} />");
  });

  it("defines 44px minimum controls and a live status announcement", () => {
    const component = source("./RecoveryEvidenceNotebook.tsx");
    expect(component).toContain("minHeight: 44");
    expect(component).toContain('role="status"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('type="button"');
  });

  it("does not include restricted organisation names", () => {
    const needles = forbiddenOrgNeedles();
    for (const filename of recoveryFiles) {
      const contents = source(filename).toLowerCase();
      expect(needles.some((needle) => contents.includes(needle.toLowerCase()))).toBe(false);
    }
  });

  it("keeps messages independent of external services", () => {
    const component = source("./RecoveryEvidenceNotebook.tsx");
    expect(component.includes("fetch(")).toBe(false);
    expect(component.includes("localStorage")).toBe(false);
    expect(component.includes("setInterval")).toBe(false);
  });

  it("keeps each user string in both languages", () => {
    const en = evidenceCopy("en");
    const fr = evidenceCopy("fr");
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    expect(Object.keys(en.issues).sort()).toEqual(Object.keys(fr.issues).sort());
    expect(Object.keys(en.state).sort()).toEqual(Object.keys(fr.state).sort());
    expect(Object.keys(en.tiers).sort()).toEqual(Object.keys(fr.tiers).sort());
  });

  it("has no unsupported status claims in copy", () => {
    for (const language of ["en", "fr"] as const) {
      const content = JSON.stringify(evidenceCopy(language)).toLowerCase();
      for (const word of ["ver" + "ified", "ver" + "ify", "vér" + "ifi", "real" + "-time", "guar" + "antee"]) {
        expect(content.includes(word)).toBe(false);
      }
    }
  });
});
