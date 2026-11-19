import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mountOfflineDiagnostics } from "./offlineDiagnosticsPanel";

/** Prevent a later integration edit from silently dropping this live panel. */
describe("offline diagnostics route wiring", () => {
  it("exports the mounted diagnostics panel", () => {
    const barrel = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(barrel).toContain('export * from "./offlineDiagnosticsPanel"');
    expect(barrel).toContain('export * from "./offlineDiagnostics"');
    expect(barrel).toContain('export * from "./offlineDiagnosticsCopy"');
    expect(typeof mountOfflineDiagnostics).toBe("function");
  });

  it("keeps diagnostics connected to the live dashboard", () => {
    const dashboard = readFileSync(new URL("./offlineDashboard.ts", import.meta.url), "utf8");
    expect(dashboard).toContain('import { mountOfflineDiagnostics } from "./offlineDiagnosticsPanel"');
    expect(dashboard).toContain("mountOfflineDiagnostics(diagnosticsHost, manifest, model, language)");
    expect(dashboard).toContain("unmountDiagnostics()");
  });

  it("does not displace existing recovery and comparison mounts", () => {
    const dashboard = readFileSync(new URL("./offlineDashboard.ts", import.meta.url), "utf8");
    expect(dashboard).toContain("mountOfflineTriage(");
    expect(dashboard).toContain("mountOfflineCleanup(");
    expect(dashboard).toContain("mountOfflineUpdateReview(");
    expect(dashboard).toContain("mountOfflineSessionComparison(");
  });
});
