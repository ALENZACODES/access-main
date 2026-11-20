import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import {
  changeCaseStatus, emptyCasebook, openCase, previewCasebookImport,
  summarizeCasebookSources,
} from "./offlineCasebook";

const first = { source: "Open A", licence: "CC BY 4.0", date: "2026-01-01" };
const second = { source: "Open B", licence: "CC0 1.0", date: "2026-02-02" };
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "a", bytes: 10, provenance: first },
    { id: "b", bytes: 20, provenance: first },
    { id: "c", bytes: 30, provenance: second },
  ],
};
const early = "2026-11-19T12:00:00.000Z";
const later = "2026-11-19T12:01:00.000Z";
function sample() {
  let book = emptyCasebook("north");
  book = openCase(book, manifest, null, "a", "other", early);
  book = openCase(book, manifest, null, "b", "not-downloaded", early);
  book = openCase(book, manifest, null, "c", "out-of-date", later);
  return book;
}

describe("casebook source grouping", () => {
  it("returns an empty source list for an empty book", () => {
    expect(summarizeCasebookSources(emptyCasebook("north"))).toEqual([]);
  });

  it("groups exact matching source records only", () => {
    expect(summarizeCasebookSources(sample())).toHaveLength(2);
  });

  it("keeps all source and licence details", () => {
    const groups = summarizeCasebookSources(sample());
    expect(groups[0]?.provenance).toEqual(first);
    expect(groups[1]?.provenance).toEqual(second);
  });

  it("counts cases and byte totals per source", () => {
    const groups = summarizeCasebookSources(sample());
    expect(groups[0]).toMatchObject({ cases: 2, listedBytes: 30 });
    expect(groups[1]).toMatchObject({ cases: 1, listedBytes: 30 });
  });

  it("never merges different publication dates", () => {
    const updated = { ...manifest, cells: manifest.cells.map((cell) =>
      cell.id === "b" ? { ...cell, provenance: { ...first, date: "2026-01-02" } } : cell) };
    let book = emptyCasebook("north");
    book = openCase(book, updated, null, "a", "other", early);
    book = openCase(book, updated, null, "b", "other", later);
    expect(summarizeCasebookSources(book)).toHaveLength(2);
  });

  it("sorts unique cell IDs in a stable order", () => {
    const groups = summarizeCasebookSources(sample());
    expect(groups[0]?.cellIds).toEqual(["a", "b"]);
  });

  it("retains latest update time per source", () => {
    const groups = summarizeCasebookSources(sample());
    expect(groups[1]?.lastUpdatedAt).toBe(later);
  });

  it("counts an unknown copy without guessing current availability", () => {
    expect(summarizeCasebookSources(sample())[0]?.unknown).toBe(2);
  });

  it("counts a closed case separately from unresolved cases", () => {
    const book = changeCaseStatus(sample(), "case-1", later, "closed");
    expect(summarizeCasebookSources(book)[0]?.unresolved).toBe(1);
  });

  it("does not export a device identity for source groupings", () => {
    const summary = JSON.stringify(summarizeCasebookSources(sample()));
    expect(summary).not.toContain("deviceId");
    expect(summary).not.toContain("localStorage");
  });
});

describe("import conflict preview", () => {
  it("reports empty imports as compatible but not accepted", () => {
    const result = previewCasebookImport(sample(), emptyCasebook("north"), manifest);
    expect(result).toMatchObject({ compatible: true, accepted: [], conflicts: [] });
  });

  it("refuses a different region", () => {
    const result = previewCasebookImport(sample(), emptyCasebook("other"), manifest);
    expect(result.compatible).toBe(false);
  });

  it("does not accept an already-present case twice", () => {
    const book = sample();
    expect(previewCasebookImport(book, book, manifest).accepted).toEqual([]);
  });

  it("shows new nonconflicting identifiers as a preview, not a write", () => {
    const incoming = openCase(emptyCasebook("north"), manifest, null, "a", "other", early);
    const result = previewCasebookImport(emptyCasebook("north"), incoming, manifest);
    expect(result.accepted).toEqual(["case-1"]);
    expect(result.compatible).toBe(true);
  });

  it("does not mutate the original book during a preview", () => {
    const original = emptyCasebook("north");
    const incoming = sample();
    previewCasebookImport(original, incoming, manifest);
    expect(original.cases).toEqual([]);
    expect(original.revision).toBe(0);
  });

  it("detects an identifier referring to a different cell", () => {
    const existing = openCase(emptyCasebook("north"), manifest, null, "a", "other", early);
    const incoming = openCase(emptyCasebook("north"), manifest, null, "b", "other", early);
    expect(previewCasebookImport(existing, incoming, manifest).conflicts).toEqual(["case-1"]);
  });

  it("reports historic records whose source date no longer matches", () => {
    const incoming = openCase(emptyCasebook("north"), manifest, null, "a", "other", early);
    const altered: RegionManifest = { ...manifest, cells: manifest.cells.map((cell) =>
      cell.id === "a" ? { ...cell, provenance: { ...first, date: "2026-06-01" } } : cell) };
    expect(previewCasebookImport(emptyCasebook("north"), incoming, altered).unknown).toEqual(["case-1"]);
  });

  it("does not import unknown evidence as current device availability", () => {
    const incoming = sample();
    const preview = previewCasebookImport(emptyCasebook("north"), incoming, manifest);
    expect(preview).not.toHaveProperty("downloaded");
    expect(preview.accepted).toHaveLength(3);
  });

  it("retains original source metadata after a conflict preview", () => {
    const incoming = sample();
    const before = incoming.cases[0]?.source;
    previewCasebookImport(emptyCasebook("north"), incoming, manifest);
    expect(incoming.cases[0]?.source).toEqual(before);
  });

  it("does not offer automatic merging or conflict resolution", () => {
    const result = previewCasebookImport(sample(), sample(), manifest);
    expect(Object.keys(result)).toEqual(["compatible", "accepted", "conflicts", "unknown"]);
  });
});
