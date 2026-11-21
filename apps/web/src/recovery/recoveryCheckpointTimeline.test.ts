import { describe, expect, it } from "vitest";
import {
  buildCheckpointTimelines, exportCheckpointTimelines, filterCheckpointTimelines,
  summarizeCheckpointTimelines, timelineHasConflict, timelineHasUnknown, timelineLatestDate,
} from "./recoveryCheckpointTimeline";
import { emptyCheckpointDocument, type CheckpointDocument, type CheckpointEntry } from "./recoveryCheckpoint";

const source = { name: "Public source", licence: "CC0-1.0", date: "2026-11-19", tier: "UNKNOWN" as const, reference: "local-1" };
const entry = (patch: Partial<CheckpointEntry> = {}): CheckpointEntry => ({
  id: "checkpoint-1", packId: "region-1", operation: "pack",
  capturedAt: "2026-11-19T12:00:00.000Z",
  source, observation: { bytes: null, digest: null, condition: "UNKNOWN", note: "No record" },
  phase: "draft", ...patch,
});
const later = (patch: Partial<CheckpointEntry> = {}): CheckpointEntry => entry({
  id: "checkpoint-2", capturedAt: "2026-11-19T12:01:00.000Z", ...patch,
});
const document = (...entries: CheckpointEntry[]): CheckpointDocument => ({ ...emptyCheckpointDocument(), entries });

describe("recovery checkpoint timelines", () => {
  it("starts with no timeline", () => {
    expect(buildCheckpointTimelines(document())).toEqual([]);
  });
  it("makes one timeline for one pack", () => {
    expect(buildCheckpointTimelines(document(entry()))).toHaveLength(1);
  });
  it("groups the same pack across multiple observations", () => {
    expect(buildCheckpointTimelines(document(entry(), later()))).toHaveLength(1);
  });
  it("keeps different packs separate", () => {
    expect(buildCheckpointTimelines(document(entry(), later({ packId: "region-2" })))).toHaveLength(2);
  });
  it("sorts packs by identifier", () => {
    const groups = buildCheckpointTimelines(document(entry({ packId: "z" }), later({ packId: "a" })));
    expect(groups.map((item) => item.packId)).toEqual(["a", "z"]);
  });
  it("sorts entries by submitted timestamp", () => {
    const group = buildCheckpointTimelines(document(later(), entry()))[0];
    expect(group?.events.map((item) => item.id)).toEqual(["checkpoint-1", "checkpoint-2"]);
  });
  it("does not compare a download observation with a pack observation", () => {
    const group = buildCheckpointTimelines(document(entry(), later({ operation: "download" })))[0];
    expect(group?.conflictingReports).toBe(false);
  });
  it("marks a real reported condition contradiction", () => {
    const a = entry({ observation: { bytes: 100, digest: null, condition: "available", note: "report" } });
    const b = later({ observation: { bytes: 100, digest: null, condition: "damaged", note: "report" } });
    expect(buildCheckpointTimelines(document(a, b))[0]?.conflictingReports).toBe(true);
  });
  it("does not treat UNKNOWN as a contradictory claim", () => {
    const after = later({ observation: { bytes: null, digest: null, condition: "available", note: "report" } });
    expect(buildCheckpointTimelines(document(entry(), after))[0]?.conflictingReports).toBe(false);
  });
  it("marks conflicting reported byte counts", () => {
    const a = entry({ observation: { bytes: 100, digest: null, condition: "available", note: "report" } });
    const b = later({ observation: { bytes: 200, digest: null, condition: "available", note: "report" } });
    expect(buildCheckpointTimelines(document(a, b))[0]?.conflictingReports).toBe(true);
  });
  it("does not invent a byte-count contradiction from missing sizes", () => {
    const after = later({ observation: { bytes: 100, digest: null, condition: "UNKNOWN", note: "report" } });
    expect(buildCheckpointTimelines(document(entry(), after))[0]?.conflictingReports).toBe(false);
  });
  it("counts explicitly UNKNOWN notes", () => {
    expect(buildCheckpointTimelines(document(entry()))[0]?.unknown).toBe(1);
  });
  it("counts disputed manual reviews", () => {
    expect(buildCheckpointTimelines(document(entry({ phase: "disputed" })))[0]?.disputed).toBe(1);
  });
  it("preserves individual source names", () => {
    expect(buildCheckpointTimelines(document(entry()))[0]?.sourceNames).toEqual(["Public source"]);
  });
  it("does not infer independent sources from repeated copies", () => {
    expect(buildCheckpointTimelines(document(entry(), later()))[0]?.sourceNames).toHaveLength(1);
  });
  it("counts differently named sources separately", () => {
    const after = later({ source: { ...source, name: "Another source" } });
    expect(buildCheckpointTimelines(document(entry(), after))[0]?.sourceNames).toHaveLength(2);
  });
  it("retains recorded source dates", () => {
    expect(buildCheckpointTimelines(document(entry()))[0]?.events[0]?.sourceDate).toBe(source.date);
  });
  it("retains the explicit tier", () => {
    expect(buildCheckpointTimelines(document(entry()))[0]?.events[0]?.tier).toBe("UNKNOWN");
  });
  it("retains the reported condition", () => {
    expect(buildCheckpointTimelines(document(entry()))[0]?.latestCondition).toBe("UNKNOWN");
  });
  it("marks uncertainty in a timeline event", () => {
    expect(buildCheckpointTimelines(document(entry()))[0]?.events[0]?.unsettled).toBe(true);
  });
  it("marks a disputed note as unsettled", () => {
    const row = entry({ phase: "disputed", observation: { bytes: 5, digest: null, condition: "available", note: "reported" } });
    expect(buildCheckpointTimelines(document(row))[0]?.events[0]?.unsettled).toBe(true);
  });
  it("does not assume an explicit positive report is a completed pack", () => {
    const row = entry({ observation: { bytes: 5, digest: null, condition: "available", note: "reported" } });
    expect(buildCheckpointTimelines(document(row))[0]?.latestCondition).toBe("available");
    expect(exportCheckpointTimelines(document(row))).toContain('"contentReady": false');
  });
  it("filters timelines by pack ID", () => {
    const rows = document(entry(), later({ packId: "region-2" }));
    expect(filterCheckpointTimelines(rows, { packId: "region-2" }).map((item) => item.packId)).toEqual(["region-2"]);
  });
  it("filters timelines by operation", () => {
    const rows = document(entry(), later({ operation: "export" }));
    expect(filterCheckpointTimelines(rows, { operation: "export" })).toHaveLength(1);
  });
  it("filters out undisputed groups", () => {
    expect(filterCheckpointTimelines(document(entry()), { onlyDisputed: true })).toEqual([]);
  });
  it("retains disputed groups with the manual filter", () => {
    expect(filterCheckpointTimelines(document(entry({ phase: "disputed" })), { onlyDisputed: true })).toHaveLength(1);
  });
  it("summarizes total packs", () => {
    expect(summarizeCheckpointTimelines(document(entry(), later({ packId: "region-2" }))).packs).toBe(2);
  });
  it("summarizes recorded events", () => {
    expect(summarizeCheckpointTimelines(document(entry(), later())).events).toBe(2);
  });
  it("counts unresolved groups", () => {
    expect(summarizeCheckpointTimelines(document(entry())).unresolved).toBe(1);
  });
  it("counts multiple source names", () => {
    const after = later({ source: { ...source, name: "Another source" } });
    expect(summarizeCheckpointTimelines(document(entry(), after)).withMultipleSources).toBe(1);
  });
  it("marks a truly empty timeline as empty", () => {
    expect(summarizeCheckpointTimelines(document()).withoutEvents).toBe(true);
  });
  it("reports UNKNOWN for an empty timeline", () => {
    expect(timelineHasUnknown(document())).toBe(true);
  });
  it("retains UNKNOWN in nonempty history", () => {
    expect(timelineHasUnknown(document(entry()))).toBe(true);
  });
  it("detects an explicit dispute", () => {
    expect(timelineHasConflict(document(entry({ phase: "disputed" })))).toBe(true);
  });
  it("does not invent a dispute", () => {
    expect(timelineHasConflict(document(entry()))).toBe(false);
  });
  it("returns the latest date for a selected pack", () => {
    expect(timelineLatestDate(document(entry(), later()), "region-1")).toBe(later().capturedAt);
  });
  it("returns null for a missing pack", () => {
    expect(timelineLatestDate(document(entry()), "region-2")).toBeNull();
  });
  it("includes original source records in an export", () => {
    const report = JSON.parse(exportCheckpointTimelines(document(entry())) ?? "null");
    expect(report.sourceEntries[0].source.name).toBe(source.name);
    expect(report.sourceEntries[0].source.licence).toBe(source.licence);
  });
  it("rejects an invalid document for export", () => {
    const invalid = { ...document(entry()), entries: [null] } as unknown as CheckpointDocument;
    expect(exportCheckpointTimelines(invalid)).toBeNull();
  });
});
