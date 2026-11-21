import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");

describe("shared-device handback integration", () => {
  it("exports the checklist model, copy, export and panel", () => {
    const barrel = read("apps/web/src/offline/robust/index.ts");
    expect(barrel).toContain('export * from "./sharedDeviceHandback";');
    expect(barrel).toContain('export * from "./sharedDeviceHandbackCopy";');
    expect(barrel).toContain('export * from "./sharedDeviceHandbackExport";');
    expect(barrel).toContain('export * from "./sharedDeviceHandbackPanel";');
  });

  it("keeps the panel behind an explicit lazy-loaded dashboard action", () => {
    const dashboard = read("apps/web/src/offline/robust/offlineDashboard.ts");
    expect(dashboard).toContain('import { HANDBACK_COPY } from "./sharedDeviceHandbackCopy";');
    expect(dashboard).toContain('import("./sharedDeviceHandbackPanel")');
    expect(dashboard).toContain("mountSharedDeviceHandback(handbackHost, manifest.regionId, language)");
    expect(dashboard).toContain("handbackLaunch.addEventListener");
  });

  it("invalidates an in-flight panel import on close or dashboard unmount", () => {
    const dashboard = read("apps/web/src/offline/robust/offlineDashboard.ts");
    expect(dashboard).toContain("handbackDisposed = true");
    expect(dashboard).toContain("handbackRevision += 1");
    expect(dashboard).toContain("unmountHandback();");
  });

  it("does not perform network, storage or account actions", () => {
    const panel = read("apps/web/src/offline/robust/sharedDeviceHandbackPanel.ts");
    expect(panel).not.toMatch(/\bfetch\s*\(/);
    expect(panel).not.toMatch(/\bXMLHttpRequest\b/);
    expect(panel).not.toContain("localStorage");
    expect(panel).not.toContain("sessionStorage");
    expect(panel).not.toContain("indexedDB");
    expect(panel).not.toContain("signOut(");
    expect(panel).not.toContain("delete(");
  });

  it("does not schedule background work", () => {
    const panel = read("apps/web/src/offline/robust/sharedDeviceHandbackPanel.ts");
    expect(panel).not.toContain("setInterval(");
    expect(panel).not.toContain("setTimeout(");
    expect(panel).not.toContain("requestAnimationFrame(");
  });

  it("keeps imported content in a labelled paste area rather than reading arbitrary files", () => {
    const panel = read("apps/web/src/offline/robust/sharedDeviceHandbackPanel.ts");
    expect(panel).toContain('labelled(doc, "shared-handback-import"');
    expect(panel).not.toContain('type = "file"');
    expect(panel).not.toContain("FileReader");
  });

  it("keeps the feature copy explicit that the page performs no external action", () => {
    const copy = read("apps/web/src/offline/robust/sharedDeviceHandbackCopy.ts");
    expect(copy).toContain("This checklist does not sign out");
    expect(copy).toContain("Cette liste ne ferme aucune session");
    expect(copy).toContain("It is not saved automatically");
    expect(copy).toContain("Il n’est pas enregistré automatiquement");
  });

  it("retains the current offline dashboard's other lazy panels", () => {
    const dashboard = read("apps/web/src/offline/robust/offlineDashboard.ts");
    expect(dashboard).toContain('import("./packChangeImpactPanel")');
    expect(dashboard).toContain('import("./offlineQuestionSheetPanel")');
    expect(dashboard).toContain("unmountCasebook();");
    expect(dashboard).toContain("unmountHandoff();");
  });
});
