import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
describe("access inquiry panel integration", () => {
  it("exports the independent inquiry engine", () => {
    expect(source("index.ts")).toContain('export * from "./accessInquiry";');
  });
  it("exports bilingual copy without importing panel in the entry chunk", () => {
    expect(source("index.ts")).toContain('export * from "./accessInquiryCopy";');
    expect(source("index.ts")).not.toContain('export * from "./accessInquiryPanel";');
  });
  it("exports the metadata report API", () => {
    expect(source("index.ts")).toContain('export * from "./accessInquiryExport";');
  });
  it("defers the personal panel outside the initial bundle", () => {
    expect(source("offlineDashboard.ts")).toContain('import("./accessInquiryPanel")');
  });
  it("keeps a separate host for the panel", () => {
    expect(source("offlineDashboard.ts")).toContain('const inquiryHost = element("div")');
  });
  it("does not mount a late module after disposal", () => {
    expect(source("offlineDashboard.ts")).toContain("if (inquiryDisposed) return;");
  });
  it("marks the host disposed during dashboard teardown", () => {
    expect(source("offlineDashboard.ts")).toContain("inquiryDisposed = true;");
  });
  it("cleans up the panel subscription when navigating away", () => {
    expect(source("offlineDashboard.ts")).toContain("unmountInquiry();");
  });
  it("retains the existing source-age panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineSourceAge(");
    expect(source("offlineDashboard.ts")).toContain("unmountSourceAge();");
  });
  it("retains the recovery batch panel", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineRecoveryBatches(");
    expect(source("offlineDashboard.ts")).toContain("unmountRecovery();");
  });
  it("retains the cleanup controls", () => {
    expect(source("offlineDashboard.ts")).toContain("mountOfflineCleanup(");
    expect(source("offlineDashboard.ts")).toContain("unmountCleanup();");
  });
  it("retains inventory inspection", () => {
    expect(source("offlineDashboard.ts")).toContain("createOfflineDashboardModel(");
    expect(source("offlineDashboard.ts")).toContain("inventoryPage(");
  });
  it("does not change saved packs when adding personal questions", () => {
    for (const name of ["accessInquiry.ts", "accessInquiryPanel.ts", "accessInquiryExport.ts"]) {
      const contents = source(name);
      expect(contents).not.toContain("model.download(");
      expect(contents).not.toContain("model.downloadSelected(");
      expect(contents).not.toContain("model.remove(");
    }
  });
  it("uses the shared action helper", () => {
    expect(source("accessInquiryPanel.ts")).toContain("createOfflineAction(doc, value)");
  });
  it("uses labeled, minimum-size text controls", () => {
    const code = source("accessInquiryPanel.ts");
    expect(code).toContain('element.style.minHeight = "44px"');
    expect(code).toContain('element.style.minWidth = "44px"');
    expect(code).toContain("label.htmlFor = id");
  });
  it("uses a polite status region", () => {
    expect(source("accessInquiryPanel.ts")).toContain('setAttribute("aria-live", "polite")');
  });
  it("does not schedule background work", () => {
    for (const name of ["accessInquiry.ts", "accessInquiryPanel.ts", "accessInquiryExport.ts"]) {
      expect(source(name)).not.toContain("setInterval(");
      expect(source(name)).not.toContain("setTimeout(");
    }
  });
  it("does not store personal notes in background storage", () => {
    for (const name of ["accessInquiry.ts", "accessInquiryPanel.ts", "accessInquiryExport.ts"]) {
      expect(source(name)).not.toContain("localStorage");
      expect(source(name)).not.toContain("indexedDB");
    }
  });
  it("keeps source status UNKNOWN in every inquiry question", () => {
    expect(source("accessInquiry.ts")).toContain('readonly condition: InquiryCondition;');
    expect(source("accessInquiry.ts")).toContain('type InquiryCondition = "UNKNOWN"');
  });
});
