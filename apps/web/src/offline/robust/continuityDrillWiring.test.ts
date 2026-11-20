import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
describe("offline continuity wiring", () => {
  it("retains all four public exports", () => {
    const index = source("index.ts");
    for (const name of ["continuityDrill", "continuityDrillCopy", "continuityDrillExport", "continuityDrillPanel"]) {
      expect(index).toContain(`export * from "./${name}";`);
    }
  });
  it("mounts and unmounts continuity through the live dashboard", () => {
    const code = source("offlineDashboard.ts");
    expect(code).toContain('import { mountOfflineContinuityDrill } from "./continuityDrillPanel";');
    expect(code).toContain('const continuityHost = element("div")');
    expect(code).toContain('const unmountContinuity = mountOfflineContinuityDrill(');
    expect(code).toContain('unmountContinuity();');
  });
  it("preserves the earlier offline panels and their cleanup", () => {
    const code = source("offlineDashboard.ts");
    for (const name of ["Triage", "Cleanup", "Review", "Comparison", "Ledger", "Checklist", "Durability",
      "Readiness", "Diagnostics", "Recovery", "SourceAge", "Handoff"]) expect(code).toContain(`unmount${name}();`);
  });
  it("does not download or delete saved cells", () => {
    const panel = source("continuityDrillPanel.ts");
    expect(panel).not.toContain("model.download(");
    expect(panel).not.toContain("model.downloadSelected(");
    expect(panel).not.toContain("model.remove(");
  });
  it("uses labelled 44px controls and polite announcements", () => {
    const panel = source("continuityDrillPanel.ts");
    expect(panel).toContain("createOfflineAction(doc, value)");
    expect(panel).toContain('select.style.minHeight = "44px"');
    expect(panel).toContain('input.style.minHeight = "44px"');
    expect(panel).toContain('setAttribute("aria-live", "polite")');
  });
  it("keeps UNKNOWN and metadata-only export rules", () => {
    expect(source("continuityDrillExport.ts")).toContain('tier: "UNKNOWN"');
    expect(source("continuityDrillExport.ts")).toContain("No cell payload");
    expect(source("continuityDrillCopy.ts").match(/unknown: "UNKNOWN"/g)).toHaveLength(2);
  });
});
