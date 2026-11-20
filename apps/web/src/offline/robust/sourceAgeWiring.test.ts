import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = new URL("./", import.meta.url);
const source = (name: string): string => readFileSync(new URL(name, base), "utf8");

describe("source age live dashboard integration", () => {
  it("exports the date planner", () => {
    expect(source("index.ts")).toContain('export * from "./sourceAgeReview";');
  });
  it("exports the bilingual copy", () => {
    expect(source("index.ts")).toContain('export * from "./sourceAgeCopy";');
  });
  it("exports metadata-only report generation", () => {
    expect(source("index.ts")).toContain('export * from "./sourceAgeExport";');
  });
  it("exports the mounted review panel", () => {
    expect(source("index.ts")).toContain('export * from "./sourceAgePanel";');
  });
  it("imports the new panel into the existing offline dashboard", () => {
    expect(source("offlineDashboard.ts")).toContain('import { mountOfflineSourceAge } from "./sourceAgePanel";');
  });
  it("mounts the panel on the same route as downloadRegion", () => {
    const file = source("offlineDashboard.ts");
    expect(file).toContain("downloadRegion(");
    expect(file).toContain("const unmountSourceAge = mountOfflineSourceAge(");
  });
  it("unmounts the panel cleanly", () => {
    expect(source("offlineDashboard.ts")).toContain("unmountSourceAge();");
  });
  it("keeps the existing download recovery panel mounted", () => {
    expect(source("offlineDashboard.ts")).toContain("unmountRecovery();");
  });
  it("keeps storage retention, source ledger and checklist mounts", () => {
    const content = source("offlineDashboard.ts");
    for (const name of ["mountStorageDurability", "mountOfflineSourceLedger", "mountOfflineTransferChecklist"]) {
      expect(content).toContain(name);
    }
  });
  it("keeps diagnostics, readiness and session comparison mounts", () => {
    const content = source("offlineDashboard.ts");
    for (const name of ["mountOfflineDiagnostics", "mountOfflineReadiness", "mountOfflineSessionComparison"]) {
      expect(content).toContain(name);
    }
  });
  it("reuses the existing keyboard-accessible action helper", () => {
    expect(source("sourceAgePanel.ts")).toContain("createOfflineAction");
  });
  it("does not introduce background scheduling", () => {
    for (const name of ["sourceAgeReview.ts", "sourceAgePanel.ts", "sourceAgeExport.ts"]) {
      expect(source(name)).not.toContain("setInterval");
    }
  });
});
