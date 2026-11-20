import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import {
  emptyCasebook, openCase, changeCaseStatus, addCaseNote,
  encodeCasebook,
} from "./offlineCasebook";
import {
  casebookFilename, createCasebookReport, encodeCasebookReport,
  formatCasebookReport, readCasebookFile,
} from "./offlineCasebookExport";

const date = "2026-11-19T19:30:00.000Z";
const next = "2026-11-19T19:31:00.000Z";
const source = { source: "Public city data", licence: "CC BY 4.0", date: "2026-03-01" };
const manifest: RegionManifest = {
  regionId: "centre",
  cells: [
    { id: "one", bytes: 100, provenance: source },
    { id: "two", bytes: 200, provenance: source },
  ],
};
function fixture() {
  let book = openCase(emptyCasebook("centre"), manifest, null, "one", "unreadable", date, "Local note");
  book = changeCaseStatus(book, "case-1", next, "in-review");
  book = addCaseNote(book, "case-1", next, "Keep this note local");
  return book;
}

describe("casebook metadata export", () => {
  it("creates a versioned report", () => {
    expect(createCasebookReport(fixture(), next).schema).toBe("offline-casebook-report-v1");
  });

  it("records the region and report date", () => {
    expect(createCasebookReport(fixture(), next)).toMatchObject({
      regionId: "centre", createdAt: next,
    });
  });

  it("records the case count and unknown evidence count", () => {
    const report = createCasebookReport(fixture(), next);
    expect(report.counts.total).toBe(1);
    expect(report.counts.unknown).toBe(1);
  });

  it("includes each case's exact provenance", () => {
    const report = createCasebookReport(fixture(), next);
    expect(report.cases[0]?.source).toEqual(source);
  });

  it("keeps source dates distinct from case event dates", () => {
    const report = createCasebookReport(fixture(), next);
    expect(report.cases[0]?.source.date).toBe("2026-03-01");
    expect(report.cases[0]?.createdAt).toBe(date);
  });

  it("includes event action and evidence without downloaded bytes", () => {
    const report = createCasebookReport(fixture(), next);
    expect(report.cases[0]?.events.map((event) => event.action)).toEqual([
      "opened", "status-changed", "commented",
    ]);
    expect(encodeCasebookReport(report)).not.toContain("Uint8Array");
  });

  it("never exports a browser storage key", () => {
    const report = encodeCasebookReport(createCasebookReport(fixture(), next));
    expect(report).not.toContain("localStorage");
    expect(report).not.toContain("indexedDB");
  });

  it("produces stable report JSON for the same input", () => {
    const report = createCasebookReport(fixture(), next);
    expect(encodeCasebookReport(report)).toBe(encodeCasebookReport(report));
  });

  it("terminates report JSON with a newline", () => {
    expect(encodeCasebookReport(createCasebookReport(fixture(), next)).endsWith("\n")).toBe(true);
  });

  it("rejects a report with a wrong schema", () => {
    const report = createCasebookReport(fixture(), next);
    expect(() => encodeCasebookReport({ ...report, schema: "wrong" as never })).toThrow();
  });

  it("rejects invalid dates instead of silently using the current clock", () => {
    expect(() => createCasebookReport(fixture(), "2026-02-30T12:00:00.000Z")).toThrow();
    expect(() => createCasebookReport(fixture(), "invalid")).toThrow();
  });

  it("keeps UNKNOWN as the literal token in English text", () => {
    const text = formatCasebookReport(createCasebookReport(fixture(), next), "en");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("Source: Public city data");
  });

  it("keeps UNKNOWN as the literal token in French text", () => {
    const text = formatCasebookReport(createCasebookReport(fixture(), next), "fr");
    expect(text).toContain("UNKNOWN");
    expect(text).not.toContain("INCONNU");
  });

  it("uses a nonbreaking space before French text-report colons", () => {
    const text = formatCasebookReport(createCasebookReport(fixture(), next), "fr");
    expect(text).toContain("Source\u00a0: Public city data");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
    expect(text).toContain("Date de la source\u00a0: 2026-03-01");
  });

  it("does not insert extra English punctuation spacing", () => {
    const text = formatCasebookReport(createCasebookReport(fixture(), next), "en");
    expect(text).toContain("Source: Public city data");
    expect(text).not.toContain("Source\u00a0:");
  });

  it("includes historical notes only when the user explicitly exports", () => {
    const report = createCasebookReport(fixture(), next);
    const text = formatCasebookReport(report, "en");
    expect(text).toContain("Local note");
    expect(text).toContain("Keep this note local");
  });

  it("cleans problematic directional marks from plain-text report fields", () => {
    const report = createCasebookReport(fixture(), next);
    const modified = { ...report, cases: report.cases.map((row) => ({
      ...row, events: row.events.map((event) => ({ ...event, note: "left\u202eright" })),
    })) };
    expect(formatCasebookReport(modified, "en")).toContain("left right");
    expect(formatCasebookReport(modified, "en")).not.toContain("\u202e");
  });

  it("sanitizes region identifiers in local filenames", () => {
    expect(casebookFilename("../../a / B", "json")).toBe("offline-casebook-a---b.json");
  });

  it("uses a safe fallback for empty identifiers", () => {
    expect(casebookFilename("", "txt")).toBe("offline-casebook-region.txt");
  });

  it("limits the filename length", () => {
    expect(casebookFilename("a".repeat(500), "json").length).toBeLessThan(100);
  });

  it("retains the intended file extension", () => {
    expect(casebookFilename("centre", "json")).toBe("offline-casebook-centre.json");
    expect(casebookFilename("centre", "txt")).toBe("offline-casebook-centre.txt");
  });

  it("reads UTF-8 casebook files without trusting their status", () => {
    const bytes = new TextEncoder().encode(encodeCasebook(fixture()));
    expect(readCasebookFile(bytes, "centre")).toEqual(fixture());
    expect(readCasebookFile(bytes, "centre").cases[0]?.evidence).toBe("UNKNOWN");
  });

  it("rejects invalid UTF-8 bytes", () => {
    expect(() => readCasebookFile(new Uint8Array([0xff, 0xfe]), "centre")).toThrow();
  });

  it("rejects a file with an unrelated region", () => {
    const bytes = new TextEncoder().encode(encodeCasebook(fixture()));
    expect(() => readCasebookFile(bytes, "north")).toThrow();
  });

  it("rejects a file with an invalid licence", () => {
    const parsed = JSON.parse(encodeCasebook(fixture()));
    parsed.cases[0].source.licence = "Other";
    expect(() => readCasebookFile(new TextEncoder().encode(JSON.stringify(parsed)), "centre")).toThrow();
  });

  it("rejects a file with malformed JSON", () => {
    expect(() => readCasebookFile(new TextEncoder().encode("{"), "centre")).toThrow();
  });

  it("never exposes raw cell payloads in the report schema", () => {
    const report = createCasebookReport(fixture(), next);
    const row = report.cases[0];
    expect(row && Object.keys(row)).toEqual([
      "id", "cellId", "reason", "status", "evidence", "sourceTier", "source",
      "listedBytes", "createdAt", "updatedAt", "events",
    ]);
  });
});
