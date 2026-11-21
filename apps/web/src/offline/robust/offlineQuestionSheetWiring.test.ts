import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
describe("offline question sheet integration", () => {
  it("only loads the new view after explicit interaction", () => {
    const dashboard = read("offlineDashboard.ts");
    expect(dashboard).toContain('import("./offlineQuestionSheetPanel")');
    expect(dashboard).toContain('questionLaunch.addEventListener("click", onQuestionLaunch);');
    expect(dashboard).toContain("const onQuestionLaunch = (): void => {");
  });
  it("does not add a new eager barrel export", () => {
    expect(read("index.ts")).not.toContain('export * from "./offlineQuestionSheetPanel"');
    expect(read("index.ts")).not.toContain('export * from "./offlineQuestionSheet"');
  });
  it("prevents mounting after disposal", () => {
    const dashboard = read("offlineDashboard.ts");
    expect(dashboard).toContain("if (questionDisposed || !questionOpen || token !== questionRevision) return;");
    expect(dashboard).toContain("questionDisposed = true;");
    expect(dashboard).toContain("unmountQuestion();");
    expect(dashboard).toContain('questionLaunch.removeEventListener("click", onQuestionLaunch);');
  });
  it("preserves the earlier dashboard lifecycle", () => {
    const dashboard = read("offlineDashboard.ts");
    for (const name of ["Triage", "Cleanup", "Review", "Comparison", "Ledger", "Checklist", "Durability", "Readiness",
      "Diagnostics", "Recovery", "SourceAge", "Continuity", "Casebook", "Handoff", "Timeline", "Workbook", "Preparation", "Inquiry", "Contingency"])
      expect(dashboard).toContain(`unmount${name}();`);
  });
  it("leaves the existing offline region page unmodified", () => {
    expect(read("offlineQuestionSheetPanel.ts")).not.toContain("RegionPackPage");
    expect(read("offlineQuestionSheet.ts")).not.toContain("RegionPackPage");
  });
  it("does not write to a downloaded pack", () => {
    const panel = read("offlineQuestionSheetPanel.ts");
    const model = read("offlineQuestionSheet.ts");
    for (const fragment of ["model.download(", "store.put(", "store.delete(", "deleteRegion(", "fetch(", "setInterval(", "localStorage", "indexedDB", "innerHTML"])
      expect(panel + model).not.toContain(fragment);
  });
  it("keeps native 44px controls", () => {
    const panel = read("offlineQuestionSheetPanel.ts");
    expect(panel).toContain('b.style.minHeight = "44px";');
    expect(panel).toContain('b.style.minWidth = "44px";');
    expect(panel).toContain('select.style.minHeight = "44px";');
    expect(panel).toContain('input.style.minHeight = "44px";');
  });
  it("uses polite announcements and labelled fields", () => {
    const panel = read("offlineQuestionSheetPanel.ts");
    expect(panel).toContain('status.setAttribute("aria-live", "polite");');
    expect(panel).toContain('const description = node(doc, "span", label);');
    expect(panel).toContain('const wrap = node(doc, "label");');
  });
  it("prints only the deliberately prepared handout", () => {
    const panel = read("offlineQuestionSheetPanel.ts");
    expect(panel).toContain("@media print");
    expect(panel).toContain(".offline-question-sheet-print");
    expect(panel).toContain("doc.defaultView?.print();");
  });
  it("cleans every listener and dashboard subscription", () => {
    const panel = read("offlineQuestionSheetPanel.ts");
    expect(panel).toContain("unsubscribe();");
    expect(panel).toContain("clearRows();");
    expect(panel).toContain("for (const stop of permanentListeners) stop();");
    expect(panel).toContain("section.remove();");
  });
  it("makes import replacement an explicit second action", () => {
    const panel = read("offlineQuestionSheetPanel.ts");
    expect(panel).toContain('listen(previewButton, "click",');
    expect(panel).toContain('listen(applyButton, "click",');
    expect(panel).toContain("applyButton.disabled = true;");
  });
  it("uses only safe text nodes for user notes and printable output", () => {
    const panel = read("offlineQuestionSheetPanel.ts");
    const exporter = read("offlineQuestionSheetExport.ts");
    expect(exporter).toContain("pre.textContent = exportData.content;");
    expect(panel).not.toContain("insertAdjacentHTML");
    expect(panel).not.toContain("innerHTML");
  });
});
