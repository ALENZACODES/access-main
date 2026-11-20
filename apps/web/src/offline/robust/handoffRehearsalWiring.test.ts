import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HANDOFF_COPY, HANDOFF_CHANGE, HANDOFF_FILTER, HANDOFF_ORDER } from "./handoffRehearsalCopy";

const source = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

describe("offline handoff integration", () => {
  it("keeps the new panel mounted on the existing offline dashboard", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).toContain('import("./handoffRehearsalPanel")');
    expect(dashboard).toContain("unmountHandoff = mountOfflineHandoffRehearsal(");
    expect(dashboard).toContain("if (disposedHandoff) return;");
    expect(dashboard).toContain("disposedHandoff = true;");
    expect(dashboard).toContain("unmountHandoff();");
  });
  it("keeps the robust entry point available", () => {
    const barrel = source("index.ts");
    expect(barrel).toContain('export * from "./handoffRehearsal";');
    expect(barrel).toContain('export * from "./handoffRehearsalCopy";');
    expect(barrel).toContain('export * from "./handoffRehearsalPanel";');
  });
  it("retains prior dashboard mounts and cleanup", () => {
    const dashboard = source("offlineDashboard.ts");
    for (const name of ["Triage", "Cleanup", "Review", "Comparison", "Ledger", "Checklist",
      "Durability", "Readiness", "Diagnostics", "Recovery", "SourceAge"]) {
      expect(dashboard).toContain(`unmount${name}();`);
    }
  });
  it("keeps the current pack-cell exports", () => {
    const barrel = source("index.ts");
    for (const name of ["createIndexedDbLedger", "createMemoryLedger", "createPackCellStore", "regionManifestFor"]) {
      expect(barrel).toContain(name);
    }
  });
  it("keeps the 44-pixel action helper", () => {
    const panel = source("handoffRehearsalPanel.ts");
    expect(panel).toContain("createOfflineAction");
    expect(panel).toContain('minHeight = "44px"');
    expect(panel).toContain('minWidth = "44px"');
  });
  it("does not silently schedule reads", () => {
    const panel = source("handoffRehearsalPanel.ts");
    expect(panel).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    expect(panel).not.toContain("localStorage");
    expect(panel).not.toContain("sessionStorage");
    expect(panel).not.toContain("serviceWorker");
  });
  it("includes both English and French copy for each field", () => {
    expect(Object.keys(HANDOFF_COPY.en).sort()).toEqual(Object.keys(HANDOFF_COPY.fr).sort());
  });
  it("retains UNKNOWN in both languages", () => {
    expect(HANDOFF_COPY.en.unknown).toBe("UNKNOWN");
    expect(HANDOFF_COPY.fr.unknown).toBe("UNKNOWN");
    expect(HANDOFF_CHANGE.fr.UNKNOWN).toBe("UNKNOWN");
    expect(HANDOFF_FILTER.fr.UNKNOWN).toBe("UNKNOWN");
  });
  it("has matching translated labels for change, filter and order", () => {
    for (const copy of [HANDOFF_CHANGE, HANDOFF_FILTER, HANDOFF_ORDER]) {
      expect(Object.keys(copy.en).sort()).toEqual(Object.keys(copy.fr).sort());
      expect(Object.values(copy.en).every(Boolean)).toBe(true);
      expect(Object.values(copy.fr).every(Boolean)).toBe(true);
    }
  });
  it("uses curly apostrophes and French nonbreaking punctuation", () => {
    for (const value of Object.values(HANDOFF_COPY.fr)) {
      expect(value).not.toContain("'");
      expect(value).not.toMatch(/(?<!\u00a0):/);
      expect(value).not.toMatch(/(?<!\u202f)[;!?]/);
    }
  });
  it("avoids prohibited public promises", () => {
    const copy = JSON.stringify(HANDOFF_COPY);
    for (const pattern of ["real-time", "partnership", "guarantee", "vérifié", "verified", "verify"]) {
      expect(copy.toLowerCase()).not.toContain(pattern);
    }
  });
  it("includes the review queue and plain-text export on the same page", () => {
    const panel = source("handoffRehearsalPanel.ts");
    expect(panel).toContain('import { handoffReviewText, reviewHandoff } from "./handoffReview";');
    expect(panel).toContain('const reviewSummary = node(doc, "pre")');
    expect(panel).toContain("const onReviewText = (): void => {");
    expect(panel).toContain('reviewTextButton, "click", onReviewText');
  });
  it("keeps the new feature independent of pending casebook branches", () => {
    const panel = source("handoffRehearsalPanel.ts");
    const engine = source("handoffRehearsal.ts");
    expect(panel).not.toContain("offlineCasebook");
    expect(panel).not.toContain("continuityDrill");
    expect(engine).not.toContain("offlineCasebook");
    expect(engine).not.toContain("continuityDrill");
  });
  it("leaves the published offline pack page untouched", () => {
    const dashboard = source("offlineDashboard.ts");
    expect(dashboard).not.toContain("OfflinePackPage");
    expect(dashboard).toContain("createOfflineDashboardModel");
  });
  it("explicitly provides a cleanup callback", () => {
    const panel = source("handoffRehearsalPanel.ts");
    expect(panel).toContain("disposed = true;");
    expect(panel).toContain("revision += 1;");
    expect(panel).toContain("section.remove();");
    expect(panel).toContain("element.removeEventListener(type, handler)");
  });
  it("uses safe text nodes for untrusted import data", () => {
    const panel = source("handoffRehearsalPanel.ts");
    expect(panel).toContain("created.textContent = text;");
    expect(panel).not.toContain("innerHTML");
    expect(panel).not.toContain("insertAdjacentHTML");
    expect(panel).not.toContain("eval(");
  });

});
