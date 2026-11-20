import { describe, expect, it } from "vitest";
import {
  TIMELINE_COPY, TIMELINE_FILTERS, TIMELINE_ORDERS, TIMELINE_NOTE_STATUSES,
  auditTimelineCopy, timelineCauseText, timelineChangeText, timelineCopy,
  timelineFilterText, timelineNoteStatusText, timelineOrderText,
} from "./localEvidenceTimelineCopy";

describe("timeline bilingual labels", () => {
  it("has matching fields in both languages", () => {
    expect(Object.keys(TIMELINE_COPY.en)).toEqual(Object.keys(TIMELINE_COPY.fr));
  });
  it("passes the French punctuation and apostrophe audit", () => {
    expect(auditTimelineCopy()).toEqual([]);
  });
  it("preserves UNKNOWN in French", () => {
    expect(timelineCopy("fr").unknown).toBe("UNKNOWN");
  });
  it("preserves UNKNOWN in English", () => {
    expect(timelineCopy("en").unknown).toBe("UNKNOWN");
  });
  it("describes a physical-place limitation in both languages", () => {
    expect(timelineCopy("en").intro).toContain("physical place");
    expect(timelineCopy("fr").intro).toContain("lieu physique");
  });
  it("does not introduce straight apostrophes into French copy", () => {
    for (const value of Object.values(TIMELINE_COPY.fr)) expect(value.includes("'")).toBe(false);
  });
  it("provides all requested sort choices", () => {
    expect(TIMELINE_ORDERS).toEqual(["listed", "recent", "source", "size"]);
  });
  it("provides all filtering choices", () => {
    expect(TIMELINE_FILTERS).toEqual(["all", "changed", "lost", "gained", "UNKNOWN"]);
  });
  it("provides all note lifecycle labels", () => {
    expect(TIMELINE_NOTE_STATUSES).toEqual(["open", "reviewing", "closed"]);
  });
  it("provides distinct note statuses", () => {
    expect(timelineNoteStatusText("open", "en") === timelineNoteStatusText("closed", "en")).toBe(false);
  });
  it("provides source-cause labels in English and French", () => {
    for (const code of ["present", "missing", "stale", "unreadable", "UNKNOWN", "source-change", "not-listed"] as const) {
      expect(timelineCauseText(code, "en").length > 0).toBe(true);
      expect(timelineCauseText(code, "fr").length > 0).toBe(true);
    }
  });
  it("provides changes in English and French", () => {
    for (const code of ["unchanged", "lost", "gained", "changed", "UNKNOWN"] as const) {
      expect(timelineChangeText(code, "en").length > 0).toBe(true);
      expect(timelineChangeText(code, "fr").length > 0).toBe(true);
    }
  });
  it("provides all filter and sort labels in English and French", () => {
    for (const code of TIMELINE_FILTERS) {
      expect(timelineFilterText(code, "en").length > 0).toBe(true);
      expect(timelineFilterText(code, "fr").length > 0).toBe(true);
    }
    for (const code of TIMELINE_ORDERS) {
      expect(timelineOrderText(code, "en").length > 0).toBe(true);
      expect(timelineOrderText(code, "fr").length > 0).toBe(true);
    }
  });
});
