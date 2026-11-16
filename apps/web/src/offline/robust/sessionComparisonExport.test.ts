import { describe, expect, it } from "vitest";
import type { OfflineSnapshot } from "./sessionComparison";
import { compareOfflineSnapshots } from "./sessionComparison";
import { comparisonSummary, SESSION_COPY, CHANGE_COPY } from "./sessionComparisonCopy";
import {
  makeSessionComparisonDocument, encodeSessionComparison, formatSessionComparison,
  sessionComparisonFilename,
} from "./sessionComparisonExport";

const source = { source: "Open municipal data", licence: "CC BY 4.0", date: "2026-01-01" };
const before: OfflineSnapshot = {
  regionId: "north", capturedAt: "2026-11-16T01:00:00Z", state: "partial", notes: [],
  observations: [
    { cellId: "first", state: "UNKNOWN", reason: "missing", expectedBytes: 100, source },
    { cellId: "second", state: "saved", reason: "present", expectedBytes: 200, source },
  ],
};
const after: OfflineSnapshot = {
  ...before, capturedAt: "2026-11-16T02:00:00Z", state: "complete",
  observations: before.observations.map((item) => ({
    ...item, state: "saved" as const, reason: "present" as const,
  })),
};

const result = compareOfflineSnapshots(before, after);

describe("offline session comparison export", () => {
  it("has a versioned metadata-only schema", () => {
    const report = makeSessionComparisonDocument(result);
    expect(report.schema).toBe("offline-session-comparison-v1");
    expect(report.region).toBe("north");
    expect(report.newlySaved).toBe(1);
    expect(report.unknown).toBe(0);
    expect(report.changes).toHaveLength(2);
  });

  it("exports source/licence/date and never cell payloads", () => {
    const text = encodeSessionComparison(result);
    expect(text).toContain("Open municipal data");
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("2026-01-01");
    expect(text).not.toContain("Uint8Array");
    expect(text).not.toContain("base64");
    expect(text).not.toContain("data:application");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("produces stable JSON with valid field shapes", () => {
    const text = encodeSessionComparison(result);
    expect(encodeSessionComparison(result)).toBe(text);
    expect(JSON.parse(text)).toMatchObject({
      schema: "offline-session-comparison-v1", state: "complete", newlySaved: 1,
    });
  });

  it("renders English with an explicit UNKNOWN label", () => {
    const text = formatSessionComparison(result, "en");
    expect(text).toContain("Offline copy changes");
    expect(text).toContain("Before: UNKNOWN");
    expect(text).toContain("After: Saved");
    expect(text).toContain("Source: Open municipal data");
    expect(text).toContain("Licence: CC BY 4.0");
    expect(text).toContain("Date: 2026-01-01");
  });

  it("uses French nonbreaking colon spacing", () => {
    const text = formatSessionComparison(result, "fr");
    expect(text).toContain("Avant\u00a0: INCONNU");
    expect(text).toContain("Après\u00a0: Enregistrée");
    expect(text).toContain("Source\u00a0: Open municipal data");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
    expect(text).toContain("Date\u00a0: 2026-01-01");
  });

  it("neutralizes control characters and directional overrides", () => {
    const compromised = {
      ...result,
      after: { ...result.after, capturedAt: "a\u202eb\nc" },
      changes: result.changes.map((row) => ({
        ...row, cellId: "safe\u202eaway\nmore",
      })),
    };
    const text = formatSessionComparison(compromised, "en");
    expect(text).not.toContain("\u202e");
    expect(text).toContain("safe away more");
    expect(text).toContain("a b c");
  });

  it("sanitizes identifiers used in exported filenames", () => {
    expect(sessionComparisonFilename("../North / Test", "txt")).toBe("offline-session-north---test.txt");
    expect(sessionComparisonFilename("", "json")).toBe("offline-session-region.json");
    expect(sessionComparisonFilename("A".repeat(300), "json").length).toBeLessThan(100);
  });

  it("provides both languages for every copy label and change type", () => {
    const english = Object.keys(SESSION_COPY.en);
    expect(Object.keys(SESSION_COPY.fr)).toEqual(english);
    expect(Object.keys(CHANGE_COPY.fr)).toEqual(Object.keys(CHANGE_COPY.en));
    for (const value of Object.values(SESSION_COPY.fr)) expect(value.length).toBeGreaterThan(0);
    for (const value of Object.values(CHANGE_COPY.fr)) expect(value.length).toBeGreaterThan(0);
  });

  it("shows summary counts in both languages", () => {
    expect(comparisonSummary(result, "en")).toContain("Newly saved: 1");
    expect(comparisonSummary(result, "fr")).toContain("Nouvelles copies enregistrées\u00a0: 1");
    expect(comparisonSummary(result, "fr")).toContain("INCONNU après\u00a0: 0");
  });
});
