import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
describe("timeline dashboard integration", () => {
  it("keeps all timeline exports in the public barrel", () => {
    const barrel = source("index.ts");
    for (const name of ["localEvidenceTimeline", "localEvidenceTimelineCopy", "localEvidenceTimelineExport", "localEvidenceTimelinePanel"]) {
      expect(barrel).toContain(`export * from "./${name}";`);
    }
  });
  it("mounts the panel outside the initial offline page chunk", () => {
    expect(source("offlineDashboard.ts")).toContain('import("./localEvidenceTimelinePanel")');
  });
  it("does not mount a late module after disposal", () => {
    expect(source("offlineDashboard.ts")).toContain("if (timelineDisposed) return;");
    expect(source("offlineDashboard.ts")).toContain("timelineDisposed = true;");
    expect(source("offlineDashboard.ts")).toContain("unmountTimeline();");
  });
  it("retains earlier dashboard panels", () => {
    const text = source("offlineDashboard.ts");
    for (const name of ["Triage", "Cleanup", "Review", "Comparison", "Ledger", "Checklist", "Durability",
      "Readiness", "Diagnostics", "Recovery", "SourceAge"]) expect(text).toContain(`unmount${name}();`);
  });
  it("uses the shared minimum-touch-area action helper", () => {
    expect(source("localEvidenceTimelinePanel.ts")).toContain("createOfflineAction(doc, label)");
    expect(source("localEvidenceTimelinePanel.ts")).toContain('control.style.minHeight = "44px"');
    expect(source("localEvidenceTimelinePanel.ts")).toContain('control.style.minWidth = "44px"');
  });
  it("does not run background timers or change saved pack data", () => {
    for (const name of ["localEvidenceTimeline.ts", "localEvidenceTimelineCopy.ts", "localEvidenceTimelinePanel.ts"]) {
      const content = source(name);
      for (const excluded of ["setInterval(", "setTimeout(", "model.download(", "model.downloadSelected(", "model.remove("]) {
        expect(content.includes(excluded)).toBe(false);
      }
    }
  });
  it("retains exact UNKNOWN token in both languages", () => {
    const text = source("localEvidenceTimelineCopy.ts");
    expect(text).toContain('unknown: "UNKNOWN"');
    expect(text.includes('unknown: "INCONNU"')).toBe(false);
  });
  it("leaves the existing offline page component unchanged", () => {
    expect(source("offlineDashboard.ts").includes("OfflinePackPage")).toBe(false);
  });
});
