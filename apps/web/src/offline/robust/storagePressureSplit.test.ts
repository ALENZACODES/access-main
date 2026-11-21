import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./storagePressure.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("./offlineDashboard.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("offline dashboard split and safe teardown", () => {
  it("keeps the pressure mount API and controller exports", () => {
    for (const name of ["mountStoragePressurePanel", "createPressureController", "pressureView"]) {
      expect(source).toContain(`function ${name}(`);
    }
  });

  it("separates the substantial dashboard from the page entry", () => {
    expect(source).not.toMatch(/^import\s+.*from\s+["']\.\/offlineDashboard["']/m);
    expect(source).toContain('import("./offlineDashboard")');
    expect(source).toContain("mountOfflineDashboard(root, manifest, dependencies, language)");
    expect(index).toContain('export * from "./storagePressure";');
  });

  it("prevents an async module from mounting after unmount", () => {
    expect(source).toContain("if (disposed) return;");
    expect(source).toContain("disposed = true;");
    expect(source).toContain("unmount?.();");
    expect(source).toContain("status.remove();");
  });

  it("does not make the dashboard unavailable when an optional chunk fails", () => {
    expect(source).toContain(".catch(() => {");
    expect(source).toContain("UNKNOWN");
    expect(source).toContain('setAttribute("aria-live", "polite")');
  });

  it("retains the core dashboard, download and existing panels", () => {
    for (const name of [
      "mountOfflineTriage", "mountOfflineCleanup", "mountOfflineUpdateReview",
      "mountOfflineSessionComparison", "mountOfflineSourceLedger",
      "mountOfflineTransferChecklist", "mountStorageDurability",
      "mountOfflineReadiness", "mountOfflineDiagnostics", "mountOfflineRecoveryBatches",
      "mountOfflineSourceAge",
    ]) {
      expect(dashboard).toContain(`${name}(`);
    }
  });

  it("does not add timers, third-party requests or new budget constants", () => {
    for (const forbidden of ["setInterval(", "setTimeout(", "fetch(", "524288", "524_288", "tile.openstreetmap.org"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
