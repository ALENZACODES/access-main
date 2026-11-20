import { describe, expect, it } from "vitest";
import { type RegionManifest } from "./regionDownload";
import { reviewSourceAge } from "./sourceAgeReview";
import {
  createSourceAgeDocument, encodeSourceAgeDocument,
  formatSourceAgeDocument, safeSourceAgeText, sourceAgeFilename,
  type SourceAgeDocument,
} from "./sourceAgeExport";

const source = { source: "City open records", licence: "CC BY 4.0", date: "2026-01-01" };
const manifest: RegionManifest = {
  regionId: "east",
  cells: [
    { id: "first", bytes: 100, provenance: source },
    { id: "second", bytes: 200, provenance: source },
  ],
};
const report = (): SourceAgeDocument => createSourceAgeDocument(
  reviewSourceAge(manifest, null, "2026-11-19"),
);

describe("source age local-only reports", () => {
  it("uses an explicit versioned schema", () => {
    expect(report().schema).toBe("offline-source-age-v1");
  });
  it("stores the review date as a plain date", () => {
    expect(report().asOf).toBe("2026-11-19");
  });
  it("retains UNKNOWN instead of treating an unreadable store as saved", () => {
    expect(report().state).toBe("UNKNOWN");
    expect(report().records.map((r) => r.copyBand)).toEqual(["UNKNOWN", "UNKNOWN"]);
  });
  it("does not invent evidence tiers", () => {
    expect(report().records.every((r) => r.evidenceTier === "UNKNOWN")).toBe(true);
  });
  it("preserves provenance source and licence", () => {
    expect(report().records[0]?.source).toEqual(source);
  });
  it("preserves listed bytes without downloading payloads", () => {
    expect(report().records.map((r) => r.bytes)).toEqual([100, 200]);
  });
  it("creates human-readable JSON", () => {
    const text = encodeSourceAgeDocument(report());
    expect(text).toContain('"offline-source-age-v1"');
    expect(text.endsWith("\n")).toBe(true);
  });
  it("never puts raw binary payloads in JSON", () => {
    const text = encodeSourceAgeDocument(report());
    expect(text).not.toContain("Uint8Array");
    expect(text).not.toContain("data:application");
    expect(text).not.toContain("base64");
  });
  it("produces parseable JSON with all rows", () => {
    const parsed: unknown = JSON.parse(encodeSourceAgeDocument(report()));
    expect(parsed).toMatchObject({ schema: "offline-source-age-v1", counts: { total: 2 } });
  });
  it("makes the same JSON for the same review", () => {
    expect(encodeSourceAgeDocument(report())).toBe(encodeSourceAgeDocument(report()));
  });
  it("renders English source information", () => {
    const text = formatSourceAgeDocument(report(), "en");
    expect(text).toContain("Source: City open records");
    expect(text).toContain("Licence: CC BY 4.0");
  });
  it("renders French with NBSP before colons", () => {
    const text = formatSourceAgeDocument(report(), "fr");
    expect(text).toContain("Source\u00a0: City open records");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
  });
  it("retains UNKNOWN in the French record output", () => {
    expect(formatSourceAgeDocument(report(), "fr")).toContain("UNKNOWN");
  });
  it("does not export arbitrary bidi override characters", () => {
    expect(safeSourceAgeText("first\u202eother")).toBe("first other");
  });
  it("does not export inserted newlines in source fields", () => {
    expect(safeSourceAgeText("first\nsecond")).toBe("first second");
  });
  it("does not turn a region ID into a file path", () => {
    expect(sourceAgeFilename("../East / Data", "json")).toBe("source-age-east-data.json");
  });
  it("uses a safe filename fallback", () => {
    expect(sourceAgeFilename("", "txt")).toBe("source-age-region.txt");
  });
  it("limits long filename stems", () => {
    expect(sourceAgeFilename("a".repeat(1000), "json").length).toBeLessThan(100);
  });
  it("rejects report arrays larger than the documented limit", () => {
    const example = report();
    const huge: SourceAgeDocument = {
      ...example, records: Array.from({ length: 50_001 }, () => example.records[0]!),
    };
    expect(() => encodeSourceAgeDocument(huge)).toThrow("Too many records");
  });
  it("preserves exact metadata structure across language formats", () => {
    const json = JSON.parse(encodeSourceAgeDocument(report())) as SourceAgeDocument;
    expect(json.records[0]?.source?.date).toBe("2026-01-01");
    expect(formatSourceAgeDocument(report(), "fr")).toContain("2026-01-01");
  });
});
