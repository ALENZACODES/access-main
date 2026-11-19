import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";
import { recoveryDryRunCopy } from "./recoveryDryRunCopy";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const files = ["./recoveryDryRun.ts", "./recoveryDryRunCopy.ts", "./RecoveryDryRunPanel.tsx", "./RECOVERY_DRY_RUN.md"];

describe("dry-run integration audit", () => {
  it("is mounted by the live recovery shell", () => {
    const center = source("./RecoveryCenter.tsx");
    expect(center).toContain('import { RecoveryDryRunPanel } from "./RecoveryDryRunPanel"');
    expect(center).toContain("<RecoveryDryRunPanel locale={locale} records={inventory}");
    expect(center).toContain("inspected={hasInspected && !checking && !inventoryFailure}");
  });
  it("does not create a second forbidden-organisation scheme", () => {
    for (const file of files) {
      const content = source(file).toLowerCase();
      expect(content).not.toContain("fromcharcode");
      for (const needle of forbiddenOrgNeedles()) expect(content).not.toContain(needle.toLowerCase());
    }
  });
  it("uses manual actions without background tasks", () => {
    const content = files.map(source).join("\n").toLowerCase();
    for (const forbidden of ["navigator.serviceworker", "fetch(", "localstorage.", "force-push"]) {
      expect(content).not.toContain(forbidden);
    }
  });
  it("keeps meaningful controls at or above 44 pixels", () => {
    const component = source("./RecoveryDryRunPanel.tsx");
    expect(component).toContain("minHeight: 44");
    expect(component).toContain("minWidth: 44");
    expect(component).toContain('role="status"');
  });
  it("provides complete English and French copy without overclaims", () => {
    for (const locale of ["en", "fr"] as const) {
      const copy = recoveryDryRunCopy(locale);
      for (const value of [copy.heading, copy.description, copy.export, ...Object.values(copy.status), ...Object.values(copy.reasons)]) {
        expect(value.length).toBeGreaterThan(0);
        expect(/verified|verify|vérif/iu.test(value)).toBe(false);
      }
    }
  });
});
