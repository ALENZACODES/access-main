import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import { captureHandoff, startHandoff, updateHandoff, appendHandoffNote, type HandoffBook } from "./handoffRehearsal";
import { handoffReviewText, pageHandoffReview, reviewHandoff } from "./handoffReview";

const source = { source: "Ontario data catalogue", licence: "Open Government Licence", date: "2026-11-01" };
const a = "2026-11-19T12:00:00.000Z";
const b = "2026-11-19T13:00:00.000Z";
const manifest: RegionManifest = { regionId: "test-region", cells: [
  { id: "a", bytes: 100, provenance: source },
  { id: "b", bytes: 200, provenance: source },
  { id: "c", bytes: 300, provenance: source },
  { id: "d", bytes: 400, provenance: source },
] };
const history = (): HandoffBook => startHandoff(captureHandoff(manifest, null, a));
function withNote(book: HandoffBook, cellId: string, id = "note-1", resolution: "open" | "closed" = "open"): HandoffBook {
  return appendHandoffNote(book, { id, cellId, kind: "observation", resolution,
    text: "Manual reading of local copy", at: b });
}
function inventory(causes: readonly ("present" | "missing" | "stale" | "unreadable")[]) {
  const cells = manifest.cells.map((cell, i) => ({
    id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
    state: causes[i] === "present" ? "saved" as const : "unknown" as const,
    cause: causes[i],
  }));
  const savedCount = cells.filter((cell) => cell.state === "saved").length;
  return { regionId: manifest.regionId, cells, savedCount,
    unknownCount: cells.length - savedCount, savedBytes: 0, expectedBytes: 1000, complete: false };
}
function comparing() {
  const before = captureHandoff(manifest, inventory(["present", "missing", "present", "unreadable"]), a);
  const after = captureHandoff(manifest, inventory(["missing", "present", "unreadable", "unreadable"]), b);
  return updateHandoff(startHandoff(before), after);
}

describe("handoff review queue", () => {
  it("keeps an absent later reading as UNKNOWN", () => {
    const review = reviewHandoff(history());
    expect(review.status).toBe("UNKNOWN");
    expect(review.afterAt).toBeNull();
    expect(review.totalItems).toBe(4);
    expect(review.reviewItems.every((item) => item.reason === "no-later-reading")).toBe(true);
  });
  it("records the source and expected file bytes", () => {
    const item = reviewHandoff(history()).reviewItems[0];
    expect(item.source).toBe("Ontario data catalogue");
    expect(item.expectedBytes).toBe(100);
    expect(item.provenanceDate).toBe("2026-11-01");
  });
  it("records a lost copy as a review item", () => {
    const review = reviewHandoff(comparing());
    expect(review.reviewItems.find((item) => item.cellId === "a")).toMatchObject({
      reason: "missing-now", priority: "attention",
    });
  });
  it("distinguishes a newly saved local copy", () => {
    const review = reviewHandoff(comparing());
    expect(review.reviewItems.find((item) => item.cellId === "b")).toMatchObject({
      reason: "new-local-copy", priority: "information",
    });
  });
  it("flags unreadable copies without inferring success", () => {
    const review = reviewHandoff(comparing());
    expect(review.unreadableNow).toBe(2);
    expect(review.reviewItems.find((item) => item.cellId === "c")?.reason).toBe("unreadable-now");
  });
  it("counts missing records", () => {
    expect(reviewHandoff(comparing()).missingNow).toBe(1);
  });
  it("counts unknown observations", () => {
    expect(reviewHandoff(comparing()).unknownNow).toBe(3);
  });
  it("does not treat a closed note as an available file", () => {
    const review = reviewHandoff(withNote(history(), "a", "closed-note", "closed"));
    expect(review.reviewItems[0].status).toBe("UNKNOWN");
  });
  it("counts open notes", () => {
    const book = withNote(withNote(history(), "a", "note-a"), "b", "note-b");
    expect(reviewHandoff(book).openNotes).toBe(2);
  });
  it("does not count closed notes as open", () => {
    const book = withNote(withNote(history(), "a", "note-a"), "b", "note-b", "closed");
    expect(reviewHandoff(book).openNotes).toBe(1);
  });
  it("tracks the note IDs for each cell", () => {
    const book = withNote(withNote(history(), "a", "note-a"), "a", "note-b");
    expect(reviewHandoff(book).reviewItems[0].noteIds).toEqual(["note-a", "note-b"]);
  });
  it("flags source metadata drift", () => {
    const book = comparing();
    const after = book.after;
    if (after === null) throw new Error("Expected a later capture");
    const changed = { ...after, cells: [
      { ...after.cells[0], source: { ...after.cells[0].source, date: "2026-11-18" } }, ...after.cells.slice(1),
    ] };
    const review = reviewHandoff({ ...book, after: changed });
    expect(review.sourceMismatch).toBe(1);
    expect(review.reviewItems[0].reason).toBe("source-mismatch");
    expect(review.reviewItems[0].status).toBe("UNKNOWN");
  });
  it("keeps the queue deterministic across reads", () => {
    expect(reviewHandoff(comparing())).toEqual(reviewHandoff(comparing()));
  });
  it("preserves manifest ordering in the review queue", () => {
    expect(reviewHandoff(comparing()).reviewItems.map((item) => item.cellId)).toEqual(["a", "b", "c", "d"]);
  });
  it("does not include a note as a source proof", () => {
    const review = reviewHandoff(withNote(history(), "a"));
    expect(review.reviewItems[0].status).toBe("UNKNOWN");
  });
});

describe("review pagination and output", () => {
  const totals = reviewHandoff(comparing());
  it("paginates without changing queue size", () => {
    expect(pageHandoffReview(totals, { limit: 2 }).items).toHaveLength(2);
    expect(pageHandoffReview(totals, { offset: 2, limit: 2 }).items).toHaveLength(2);
  });
  it("exposes stable navigation flags", () => {
    expect(pageHandoffReview(totals, { limit: 2 })).toMatchObject({ previous: false, next: true });
    expect(pageHandoffReview(totals, { offset: 2, limit: 2 })).toMatchObject({ previous: true, next: false });
  });
  it("filters by category", () => {
    expect(pageHandoffReview(totals, { reason: "missing-now" }).items.map((item) => item.cellId)).toEqual(["a"]);
  });
  it("filters by attention priority", () => {
    expect(pageHandoffReview(totals, { priority: "attention" }).items.length).toBeGreaterThan(0);
  });
  it("filters by conservative status", () => {
    expect(pageHandoffReview(totals, { status: "UNKNOWN" }).items.every((item) => item.status === "UNKNOWN")).toBe(true);
  });
  it("searches IDs case insensitively", () => {
    expect(pageHandoffReview(totals, { search: "A" }).items.map((item) => item.cellId)).toEqual(["a", "b", "c", "d"]);
  });
  it("searches provenance", () => {
    expect(pageHandoffReview(totals, { search: "ONTARIO" }).total).toBe(4);
  });
  it("rejects invalid offsets", () => {
    for (const offset of [-1, 0.5, NaN]) expect(() => pageHandoffReview(totals, { offset })).toThrow();
  });
  it("rejects limits beyond the bounded page size", () => {
    for (const limit of [0, 51, -1, 1.1]) expect(() => pageHandoffReview(totals, { limit })).toThrow();
  });
  it("has a readable English report", () => {
    const text = handoffReviewText(totals, "en");
    expect(text).toContain("Offline handoff review");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("test-region");
  });
  it("has a French report using a nonbreaking space before colons", () => {
    const text = handoffReviewText(totals, "fr");
    expect(text).toContain("Examen du transfert hors ligne");
    expect(text).toContain("Région\u00a0:");
    expect(text).toContain("UNKNOWN");
  });
  it("does not display an absent end time as an observed event", () => {
    expect(handoffReviewText(reviewHandoff(history()), "en")).toContain("End: UNKNOWN");
  });
});
