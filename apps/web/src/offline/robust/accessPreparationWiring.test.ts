import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
describe("personal preparation on the existing offline dashboard", () => {
  it("exports the typed model", () => {
    expect(source("index.ts")).toContain('export * from "./accessPreparation";');
  });
  it("exports the bilingual copy", () => {
    expect(source("index.ts")).toContain('export * from "./accessPreparationCopy";');
  });
  it("exports safe metadata-only reports", () => {
    expect(source("index.ts")).toContain('export * from "./accessPreparationExport";');
  });
  it("exports the accessible browser panel", () => {
    expect(source("index.ts")).toContain('export * from "./accessPreparationPanel";');
  });
  it("keeps the preparation panel out of the initial bundle", () => {
    expect(source("offlineDashboard.ts")).toContain('import("./accessPreparationPanel")');
  });
  it("creates a dedicated host", () => {
    expect(source("offlineDashboard.ts")).toContain('const preparationHost = element("div")');
  });
  it("mounts with the current manifest, model and language", () => {
    expect(source("offlineDashboard.ts")).toContain('mountAccessPreparation(preparationHost, manifest, model, language)');
  });
  it("prevents late mount after disposal", () => {
    expect(source("offlineDashboard.ts")).toContain("if (disposedPreparation) return;");
  });
  it("marks disposal before unmount", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard.indexOf("disposedPreparation = true;")).toBeLessThan(dashboard.indexOf("unmountPreparation();"));
  });
  it("preserves the existing source-age panel", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain("mountOfflineSourceAge(");
    expect(dashboard).toContain("unmountSourceAge();");
  });
  it("preserves all older teardown hooks", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const name of ["Triage", "Cleanup", "Review", "Comparison", "Ledger", "Checklist",
      "Durability", "Readiness", "Diagnostics", "Recovery", "SourceAge"]) {
      expect(dashboard).toContain(`unmount${name}();`);
    }
  });
  it("keeps a real minimum target size", () => {
    const panel = source("accessPreparationPanel.ts");
    expect(panel).toContain("createOfflineAction(doc, text)");
    expect(panel).toContain('control.style.minHeight = "44px"');
    expect(panel).toContain('control.style.minWidth = "44px"');
  });
  it("keeps user input inert on rendering", () => {
    const panel = source("accessPreparationPanel.ts");
    expect(panel).not.toContain("innerHTML");
    expect(panel).not.toContain("insertAdjacentHTML");
  });
  it("does not start automated storage mutations", () => {
    for (const name of ["accessPreparation.ts", "accessPreparationPanel.ts", "accessPreparationExport.ts"]) {
      const text = source(name);
      expect(text).not.toContain("setInterval(");
      expect(text).not.toContain("setTimeout(");
      expect(text).not.toContain("model.download(");
      expect(text).not.toContain("model.downloadSelected(");
    }
  });
  it("keeps exact attribution to OpenStreetMap if displayed elsewhere", () => {
    expect(source("offlineDashboard.ts")).not.toContain("© OSM");
  });
});
