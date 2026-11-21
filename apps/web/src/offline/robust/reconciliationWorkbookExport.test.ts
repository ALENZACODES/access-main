import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import { addWorkbookNote, captureWorkbook, startWorkbook, updateWorkbook } from "./reconciliationWorkbook";
import { createWorkbookExport } from "./reconciliationWorkbookExport";

const provenance = { source: "Ontario open records", licence: "Open Government Licence", date: "2026-11-18" };
const manifest: RegionManifest = { regionId: "ontario-region", cells: [
  { id: "one", bytes: 100, provenance },
  { id: "two", bytes: 300, provenance },
] };
const beforeAt = "2026-11-19T16:00:00.000Z";
const afterAt = "2026-11-19T17:00:00.000Z";
const before = captureWorkbook(manifest, null, beforeAt);
const after = captureWorkbook(manifest, null, afterAt);
const plain = startWorkbook(before);
const compared = updateWorkbook(plain, after);
const withNote = addWorkbookNote(compared, {
  id: "note-one", cellId: "two", kind: "question", disposition: "open",
  text: "Ask whether the source metadata changed", at: afterAt,
});

describe("metadata-only workbook exports", () => {
  it("uses a predictable JSON filename", () => {
    expect(createWorkbookExport(plain, "en", "json").filename).toBe("offline-reconciliation-ontario-region.json");
  });
  it("uses a predictable text filename", () => {
    expect(createWorkbookExport(plain, "fr", "txt").filename).toBe("offline-reconciliation-ontario-region.txt");
  });
  it("marks JSON with UTF-8 encoding", () => {
    expect(createWorkbookExport(plain, "en", "json").mime).toBe("application/json;charset=utf-8");
  });
  it("marks text with UTF-8 encoding", () => {
    expect(createWorkbookExport(plain, "fr", "txt").mime).toBe("text/plain;charset=utf-8");
  });
  it("preserves canonical workbook format in JSON", () => {
    expect(JSON.parse(createWorkbookExport(plain, "en", "json").content)).toMatchObject({
      format: "offline-reconciliation-workbook-v1",
    });
  });
  it("preserves region identifiers in JSON", () => {
    expect(JSON.parse(createWorkbookExport(plain, "en", "json").content)).toMatchObject({ regionId: manifest.regionId });
  });
  it("preserves the initial capture time", () => {
    expect(createWorkbookExport(plain, "en", "txt").content).toContain(beforeAt);
  });
  it("uses UNKNOWN when follow-up is absent", () => {
    expect(createWorkbookExport(plain, "en", "txt").content).toContain("Follow-up reading: UNKNOWN");
  });
  it("mentions follow-up timestamp once it is captured", () => {
    expect(createWorkbookExport(compared, "en", "txt").content).toContain(afterAt);
  });
  it("includes historical source identity in text export", () => {
    expect(createWorkbookExport(compared, "en", "txt").content).toContain(provenance.source);
  });
  it("includes exact licence details in text export", () => {
    expect(createWorkbookExport(compared, "en", "txt").content).toContain(provenance.licence);
  });
  it("includes exact provenance dates", () => {
    expect(createWorkbookExport(compared, "en", "txt").content).toContain(provenance.date);
  });
  it("includes expected bytes rather than downloaded cell payloads", () => {
    expect(createWorkbookExport(compared, "en", "txt").content).toContain("Expected bytes: 100");
  });
  it("includes a privacy warning in English", () => {
    expect(createWorkbookExport(plain, "en", "txt").content).toContain("private");
  });
  it("includes a privacy warning in French", () => {
    expect(createWorkbookExport(plain, "fr", "txt").content).toContain("privé");
  });
  it("uses exact map attribution in English", () => {
    expect(createWorkbookExport(plain, "en", "txt").content).toContain("© OpenStreetMap contributors");
  });
  it("uses exact map attribution in French", () => {
    expect(createWorkbookExport(plain, "fr", "txt").content).toContain("© OpenStreetMap contributors");
  });
  it("includes written notes in exported JSON", () => {
    expect(createWorkbookExport(withNote, "en", "json").content).toContain("Ask whether the source metadata changed");
  });
  it("includes written notes in exported plain text", () => {
    expect(createWorkbookExport(withNote, "en", "txt").content).toContain("Ask whether the source metadata changed");
  });
  it("includes note classification and status", () => {
    expect(createWorkbookExport(withNote, "en", "txt").content).toContain("two — question — open");
  });
  it("does not replace UNKNOWN in French", () => {
    expect(createWorkbookExport(compared, "fr", "txt").content).toContain("UNKNOWN");
  });
  it("does not require the browser to render plain text", () => {
    expect(createWorkbookExport(plain, "en", "txt").content.startsWith("Offline reconciliation workbook")).toBe(true);
  });
  it("keeps JSON format stable across selected display language", () => {
    expect(createWorkbookExport(plain, "en", "json").content).toEqual(createWorkbookExport(plain, "fr", "json").content);
  });
  it("writes no network endpoint to a generated report", () => {
    expect(createWorkbookExport(compared, "en", "txt").content).not.toContain("https://");
  });
  it("rejects malformed imported states before JSON export", () => {
    const tampered = { ...plain, before: { ...plain.before, regionId: "another-region" } };
    expect(() => createWorkbookExport(tampered, "en", "json")).toThrow();
  });
  it("does not mutate the input workbook", () => {
    const copy = JSON.stringify(withNote);
    createWorkbookExport(withNote, "en", "txt");
    expect(JSON.stringify(withNote)).toBe(copy);
  });
});
