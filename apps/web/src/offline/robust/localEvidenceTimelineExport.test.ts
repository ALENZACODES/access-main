import { describe, expect, it } from "vitest";
import { timelineBookText, timelineFilename, timelineText } from "./localEvidenceTimelineExport";
import { appendTimeline, captureTimeline, newTimeline } from "./localEvidenceTimeline";
import type { RegionManifest } from "./regionDownload";
const source = { source: "Ontario open data", licence: "Open Government Licence", date: "2026-11-01" };
const manifest: RegionManifest = { regionId: "ontario-demo", cells: [{ id: "a", bytes: 100, provenance: source }] };
const before = captureTimeline(manifest, null, "2026-11-19T12:00:00.000Z");
const after = captureTimeline(manifest, null, "2026-11-19T13:00:00.000Z");
describe("metadata-only timeline export", () => {
  it("produces UNKNOWN when no comparison exists", () => {
    expect(timelineText(null, "en")).toContain("UNKNOWN");
    expect(timelineText(null, "fr")).toContain("UNKNOWN");
  });
  it("uses the specified region in the JSON filename", () => {
    expect(timelineFilename("ontario-demo", "json")).toBe("offline-timeline-ontario-demo.json");
  });
  it("cleans hostile path separators out of the filename", () => {
    expect(timelineFilename("../a/b", "txt")).toBe("offline-timeline----a-b.txt");
  });
  it("preserves the historical uncertainty", () => {
    const book = appendTimeline(newTimeline(before), after);
    expect(timelineBookText(book, "en")).toContain("UNKNOWN");
  });
  it("uses the required French colon spacing", () => {
    const book = appendTimeline(newTimeline(before), after);
    expect(timelineBookText(book, "fr")).toContain("Région\u00a0:");
  });
  it("lists source metadata without downloaded contents", () => {
    const book = appendTimeline(newTimeline(before), after);
    const result = timelineBookText(book, "en");
    expect(result).toContain("Ontario open data");
    expect(result).toContain("Historical device-local records");
  });
  it("does not invent a later date for a single capture", () => {
    expect(timelineBookText(newTimeline(before), "fr")).toContain("UNKNOWN");
  });
});
