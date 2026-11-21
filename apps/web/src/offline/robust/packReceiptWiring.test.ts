import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (path: string): string => readFileSync(new URL(path, "file://" + ROOT + "/"), "utf8");

describe("offline pack receipt integration", () => {
  it("exports the receipt model from the offline robustness entry point", () => {
    expect(read("apps/web/src/offline/robust/index.ts")).toContain('export * from "./packReceipt";');
  });

  it("exports the bilingual copy and metadata-only export helpers", () => {
    const barrel = read("apps/web/src/offline/robust/index.ts");
    expect(barrel).toContain('export * from "./packReceiptCopy";');
    expect(barrel).toContain('export * from "./packReceiptExport";');
  });

  it("exports the panel without requiring it in the initial dashboard module", () => {
    expect(read("apps/web/src/offline/robust/index.ts")).toContain('export * from "./packReceiptPanel";');
    expect(read("apps/web/src/offline/robust/offlineDashboard.ts")).toContain('import("./packReceiptPanel")');
  });

  it("uses the small bilingual launcher catalogue", () => {
    expect(read("apps/web/src/offline/robust/offlineDashboard.ts")).toContain('import { PACK_RECEIPT_COPY } from "./packReceiptCopy";');
    expect(read("apps/web/src/offline/robust/offlineDashboard.ts")).toContain("receiptCopy.open");
    expect(read("apps/web/src/offline/robust/offlineDashboard.ts")).toContain("receiptCopy.close");
  });

  it("mounts the receipt panel only after the launch action", () => {
    const source = read("apps/web/src/offline/robust/offlineDashboard.ts");
    expect(source).toContain("const onReceiptLaunch");
    expect(source).toContain("mountOfflinePackReceipts(receiptHost, manifest, model, language)");
    expect(source).toContain("receiptLaunch.addEventListener");
  });

  it("invalidates an in-flight panel import when the dashboard unmounts", () => {
    const source = read("apps/web/src/offline/robust/offlineDashboard.ts");
    expect(source).toContain("receiptDisposed = true");
    expect(source).toContain("receiptRevision += 1");
    expect(source).toContain("unmountReceipts();");
  });

  it("keeps all imported file content in a labelled text area", () => {
    const panel = read("apps/web/src/offline/robust/packReceiptPanel.ts");
    expect(panel).toContain('labelled(doc, "textarea"');
    expect(panel).not.toContain('type = "file"');
    expect(panel).not.toContain("FileReader");
  });

  it("does not schedule refreshes or background work", () => {
    const panel = read("apps/web/src/offline/robust/packReceiptPanel.ts");
    expect(panel).not.toContain("setInterval(");
    expect(panel).not.toContain("setTimeout(");
    expect(panel).not.toContain("requestAnimationFrame(");
  });

  it("does not fetch, upload or remove offline cell payloads", () => {
    const panel = read("apps/web/src/offline/robust/packReceiptPanel.ts");
    expect(panel).not.toMatch(/\bfetch\s*\(/);
    expect(panel).not.toContain("downloadSelected(");
    expect(panel).not.toContain("deleteRegion(");
    expect(panel).not.toContain("commitCheckedRegion(");
  });

  it("keeps the capture limited to the current manifest and the dashboard inventory", () => {
    const panel = read("apps/web/src/offline/robust/packReceiptPanel.ts");
    expect(panel).toContain("createPackReceipt(manifest, model.getState().inventory");
    expect(panel).not.toContain("localStorage");
    expect(panel).not.toContain("sessionStorage");
    expect(panel).not.toContain("indexedDB");
  });

  it("does not persist a receipt automatically", () => {
    const panel = read("apps/web/src/offline/robust/packReceiptPanel.ts");
    expect(panel).not.toContain("localStorage.setItem");
    expect(panel).not.toContain("indexedDB.open");
    expect(panel).toContain('["capture"');
    expect(panel).toContain('["importButton"');
  });

  it("keeps receipt export behind explicit user controls", () => {
    const panel = read("apps/web/src/offline/robust/packReceiptPanel.ts");
    expect(panel).toContain('[exportJson, "click"');
    expect(panel).toContain('[exportText, "click"');
    expect(panel).toContain('[capture, "click"');
  });

  it("retains the exact UNKNOWN token in both languages", () => {
    const copy = read("apps/web/src/offline/robust/packReceiptCopy.ts");
    expect(copy).toContain('unknown: "UNKNOWN copies"');
    expect(copy).toContain('unknown: "Copies UNKNOWN"');
    expect(copy).toContain('UNKNOWN: "UNKNOWN"');
  });

  it("keeps the digest disclaimer clear that a digest is not a signature", () => {
    const copy = read("apps/web/src/offline/robust/packReceiptCopy.ts");
    expect(copy).toContain("It is not a signature");
    expect(copy).toContain("Ce n’est ni une signature");
  });

  it("retains existing continuity and casebook mounts", () => {
    const dashboard = read("apps/web/src/offline/robust/offlineDashboard.ts");
    expect(dashboard).toContain("mountOfflineContinuityDrill");
    expect(dashboard).toContain("mountOfflineCasebook");
    expect(dashboard).toContain("unmountContinuity();");
    expect(dashboard).toContain("unmountCasebook();");
  });
});
