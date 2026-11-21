import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import { addDependency, assessDependency, createDependencyBook, summarizeDependencies } from "./dependencyPlanner";
import { dependencyFileName, dependencyReportJson, dependencyReportText } from "./dependencyPlannerExport";
const provenance = { source: "Local data source", licence: "CC BY 4.0", date: "2026-02-01" };
const manifest: RegionManifest = { regionId: "ontario", cells: [{ id: "cell-1", bytes: 200, provenance }] };
const empty = createDependencyBook("ontario", "A planned outing", "2026-02-02");
const book = addDependency(empty, { id: "note-1", category: "entrance", title: "The entrance question", purpose: "Travel preparation",
  cellIds: ["cell-1"], priority: "essential", progress: "follow-up", note: "Personal note" }, "2026-02-03");
const rows = assessDependency(book, manifest, null);
const summary = summarizeDependencies(rows);

describe("offline dependency exports", () => {
  it("produces a parseable versioned JSON document", () => {
    const parsed = JSON.parse(dependencyReportJson(book, rows, summary)) as { schema: string; physicalAccess: string };
    expect(parsed.schema).toBe("offline-dependency-report-v1");
    expect(parsed.physicalAccess).toBe("UNKNOWN");
  });
  it("ends JSON output with a newline", () => expect(dependencyReportJson(book, rows, summary).endsWith("\n")).toBe(true));
  it("preserves source and licence metadata in JSON", () => {
    const report = dependencyReportJson(book, rows, summary);
    expect(report).toContain("CC BY 4.0");
    expect(report).toContain("Local data source");
  });
  it("does not claim missing files are saved", () => {
    const report = dependencyReportText(book, rows, summary, "en");
    expect(report).toContain("UNKNOWN");
    expect(report).toContain("Local inventory unavailable");
  });
  it("retains the user's manual note", () => expect(dependencyReportText(book, rows, summary, "en")).toContain("Personal note"));
  it("provides French text with nonbreaking punctuation", () => {
    const report = dependencyReportText(book, rows, summary, "fr");
    expect(report).toContain("Source\u00A0: Local data source");
    expect(report).toContain("Licence\u00A0: CC BY 4.0");
  });
  it("includes an explicit physical-access uncertainty", () => {
    expect(dependencyReportText(book, rows, summary, "en")).toContain("Physical accessibility: UNKNOWN");
  });
  it("includes an explicit reminder of personal-note privacy", () => {
    expect(dependencyReportText(book, rows, summary, "en")).toContain("personal notes");
  });
  it("does not add a live location", () => {
    const report = dependencyReportJson(book, rows, summary);
    expect(report).not.toContain("latitude");
    expect(report).not.toContain("longitude");
  });
  it("does not embed binary downloaded cells", () => {
    const report = dependencyReportJson(book, rows, summary);
    expect(report).not.toContain("base64");
    expect(report).not.toContain("Uint8Array");
  });
  it("does not mutate the original book", () => {
    const original = JSON.stringify(book);
    dependencyReportJson(book, rows, summary);
    expect(JSON.stringify(book)).toBe(original);
  });
  it("provides a region-safe JSON filename", () => expect(dependencyFileName("ontario", "json")).toBe("offline-dependencies-ontario.json"));
  it("provides a region-safe TXT filename", () => expect(dependencyFileName("ontario", "txt")).toBe("offline-dependencies-ontario.txt"));
  it("strips path traversal from filenames", () => expect(dependencyFileName("../../ontario", "json")).toBe("offline-dependencies-ontario.json"));
  it("handles empty region names in filenames", () => expect(dependencyFileName("", "json")).toBe("offline-dependencies-region.json"));
  it("bounds long region names in filenames", () => expect(dependencyFileName("x".repeat(1000), "txt").length < 90).toBe(true));
  it("normalizes bi-directional controls in printable text", () => {
    const altered = addDependency(empty, { id: "x", category: "entrance", title: "Safe\u202eaway", purpose: "", note: "", cellIds: [], priority: "optional", progress: "asked" }, "2026-02-03");
    const assessments = assessDependency(altered, manifest, null);
    const printed = dependencyReportText(altered, assessments, summarizeDependencies(assessments), "en");
    expect(printed).not.toContain("\u202e");
  });
  it("handles empty books without declaring data saved", () => {
    const assessments = assessDependency(empty, manifest, null);
    expect(dependencyReportText(empty, assessments, summarizeDependencies(assessments), "en")).toContain("UNKNOWN");
  });
});
