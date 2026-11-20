import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("./", import.meta.url);
const source = (name: string): string => readFileSync(new URL(name, root), "utf8");

describe("offline casebook live route wiring", () => {
  it("exports the casebook model from the public offline barrel", () => {
    expect(source("index.ts")).toContain('export * from "./offlineCasebook";');
  });

  it("exports bilingual casebook copy", () => {
    expect(source("index.ts")).toContain('export * from "./offlineCasebookCopy";');
  });

  it("exports metadata reports", () => {
    expect(source("index.ts")).toContain('export * from "./offlineCasebookExport";');
  });

  it("exports the browser panel", () => {
    expect(source("index.ts")).toContain('export * from "./offlineCasebookPanel";');
  });

  it("imports the panel from its own implementation module", () => {
    expect(source("offlineDashboard.ts")).toContain(
      'import { mountOfflineCasebook } from "./offlineCasebookPanel";',
    );
  });

  it("mounts the panel on the live offline dashboard", () => {
    expect(source("offlineDashboard.ts")).toContain(
      "const unmountCasebook = mountOfflineCasebook(",
    );
  });

  it("removes panel listeners during unmount", () => {
    expect(source("offlineDashboard.ts")).toContain("unmountCasebook();");
  });

  it("does not replace the existing recovery batch view", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineRecoveryBatches");
    expect(source("offlineDashboard.ts")).toContain("unmountRecovery();");
  });

  it("does not replace the existing source date review", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineSourceAge");
    expect(source("offlineDashboard.ts")).toContain("unmountSourceAge();");
  });

  it("retains the existing diagnostics panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineDiagnostics");
    expect(source("offlineDashboard.ts")).toContain("unmountDiagnostics();");
  });

  it("retains the existing cleanup panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineCleanup");
    expect(source("offlineDashboard.ts")).toContain("unmountCleanup();");
  });

  it("does not add periodic or scheduled state mutation", () => {
    const casebook = source("offlineCasebookPanel.ts");
    expect(casebook).not.toContain("setInterval(");
    expect(casebook).not.toContain("setTimeout(");
  });

  it("does not download any cells on opening a case", () => {
    const panel = source("offlineCasebookPanel.ts");
    expect(panel).not.toContain("model.downloadSelected(");
    expect(panel).not.toContain("model.download(");
  });

  it("requires the shared touch-target helper", () => {
    expect(source("offlineCasebookPanel.ts")).toContain("createOfflineAction");
  });
});
