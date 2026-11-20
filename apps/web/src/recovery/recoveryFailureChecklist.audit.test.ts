import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg";

const shell = readFileSync(new URL("./RecoveryCenter.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("./RecoveryFailureChecklist.tsx", import.meta.url), "utf8");
const model = readFileSync(new URL("./recoveryFailureChecklist.ts", import.meta.url), "utf8");

describe("manual failure checklist integration", () => {
  it("mounts the complete panel on the existing shell", () => {
    expect(shell).toContain('import { RecoveryFailureChecklist } from "./RecoveryFailureChecklist"');
    expect(shell).toContain("<RecoveryFailureChecklist locale={locale}");
  });
  it("preserves the previously mounted panels", () => {
    for (const name of ["RecoveryEvidenceNotebook", "RecoveryDryRunPanel", "RecoveryCaseJournal", "RecoveryTaskBoard"]) {
      expect(shell).toContain(`<${name} locale={locale}`);
    }
  });
  it("keeps all touch targets at least 44 px", () => {
    expect(ui).toContain("minHeight: 44");
    expect(ui).toContain("minWidth: 44");
  });
  it("does not include prohibited organisation strings", () => {
    for (const name of forbiddenOrgNeedles()) {
      for (const text of [shell, ui, model]) {
        expect(text.toLowerCase()).not.toContain(name.toLowerCase());
      }
    }
  });
  it("has no hidden recurring or network operations", () => {
    for (const text of [ui, model]) {
      expect(text).not.toContain("setInterval(");
      expect(text).not.toContain("fetch(");
    }
  });
  it("uses UNKNOWN as the explicit status in both languages", () => {
    expect(model).toContain('unknown: "UNKNOWN"');
    expect(ui).toContain("UNKNOWN");
  });
  it("does not claim readiness from observations", () => {
    expect(model).not.toContain('state: "ready"');
  });
  it("guards imported file sizes", () => {
    expect(ui).toContain("selected.size > 64 * 1024");
    expect(model).toContain("MAX_CHECKLIST_BYTES");
  });
});
