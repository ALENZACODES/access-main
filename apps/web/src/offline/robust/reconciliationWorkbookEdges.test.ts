import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { InventoryCause, RegionInventory } from "./regionInventory";
import {
  addWorkbookNote, captureWorkbook, compareWorkbook, pageWorkbook,
  parseWorkbook, startWorkbook, stringifyWorkbook, updateWorkbook,
  validateWorkbookCapture, workbookSummary,
} from "./reconciliationWorkbook";

const source = { source: "Public Ontario dataset", licence: "Open Government Licence", date: "2026-11-19" };
const earlier = "2026-11-20T05:00:00.000Z";
const later = "2026-11-20T06:00:00.000Z";
const manifest: RegionManifest = { regionId: "ontario", cells: [
  { id: "a", bytes: 0, provenance: source },
  { id: "b", bytes: 1, provenance: source },
  { id: "c", bytes: 10, provenance: source },
  { id: "d", bytes: 100, provenance: source },
] };
function observed(causes: readonly InventoryCause[]): RegionInventory {
  if (causes.length !== manifest.cells.length) throw new Error("Expected all causes");
  const cells = manifest.cells.map((cell, index) => {
    const cause = causes[index];
    if (cause === undefined) throw new Error("Missing cause");
    return { id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
      cause, state: cause === "present" ? "saved" as const : "unknown" as const };
  });
  const saved = cells.filter((cell) => cell.state === "saved");
  return { regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length, savedBytes: saved.reduce((n, cell) => n + cell.expectedBytes, 0),
    expectedBytes: 111, complete: saved.length === cells.length };
}
const capture = (causes: readonly InventoryCause[], at: string) => captureWorkbook(manifest, observed(causes), at);
const allPresent = () => capture(["present", "present", "present", "present"], earlier);

/** Invariants are checked across actual local-record combinations, not guessed place conditions. */
describe("reconciliation transition invariants", () => {
  const causes: readonly InventoryCause[] = ["present", "missing", "stale", "unreadable"];
  for (const firstCause of causes) {
    for (const secondCause of causes) {
      it(`classifies ${firstCause} to ${secondCause} without claiming location access`, () => {
        const initial = capture([firstCause, "missing", "missing", "missing"], earlier);
        const next = capture([secondCause, "missing", "missing", "missing"], later);
        const compared = compareWorkbook(initial, next);
        const row = compared.rows[0];
        if (row === undefined) throw new Error("Missing comparison row");
        if (firstCause === secondCause) expect(row.change).toBe("unchanged");
        else if (firstCause === "present" && secondCause === "missing") expect(row.change).toBe("lost");
        else if (firstCause === "missing" && secondCause === "present") expect(row.change).toBe("gained");
        else expect(row.change).toBe("changed");
        expect(["none", "inspect", "consider-download"]).toContain(row.action);
        expect(row.sourceChanged).toBe(false);
        expect(row.before?.source.source).toBe(source.source);
        expect(row.after?.source.source).toBe(source.source);
      });
    }
  }
  it("counts zero-byte cells as saved when observations are complete", () => {
    const summary = workbookSummary(startWorkbook(allPresent()));
    expect(summary.beforeSaved).toBe(4);
    expect(summary.bytesBefore).toBe(111);
  });
  it("treats zero bytes as valid expected metadata", () => {
    expect(allPresent().cells[0]?.source.bytes).toBe(0);
  });
  it("does not represent absent inventory as saved", () => {
    const result = captureWorkbook(manifest, null, earlier);
    expect(result.cells.filter((cell) => cell.state === "saved")).toEqual([]);
  });
  it("never interprets identical unknown causes as new evidence", () => {
    const missing = captureWorkbook(manifest, null, earlier);
    const after = captureWorkbook(manifest, null, later);
    expect(compareWorkbook(missing, after).counts.UNKNOWN).toBe(4);
  });
  it("preserves expected bytes even when a record is unreadable", () => {
    const result = capture(["unreadable", "unreadable", "unreadable", "unreadable"], earlier);
    expect(result.cells.map((cell) => cell.source.bytes)).toEqual([0, 1, 10, 100]);
  });
  it("can compare an empty manifest without fabricating a cell", () => {
    const empty: RegionManifest = { regionId: "empty", cells: [] };
    const first = captureWorkbook(empty, null, earlier);
    const next = captureWorkbook(empty, null, later);
    expect(compareWorkbook(first, next).rows).toEqual([]);
  });
  it("does not treat closing a note as confirmation of local copy state", () => {
    const book = addWorkbookNote(startWorkbook(allPresent()), {
      id: "n", cellId: "a", kind: "follow-up", disposition: "closed", text: "Manual note", at: later,
    });
    expect(book.before.cells[0]?.state).toBe("saved");
    expect(book.after).toBeNull();
  });
  it("rejects importing a saved state with unrecognised cause", () => {
    const captureValue = allPresent();
    const bad = { ...captureValue, cells: [{ ...captureValue.cells[0]!, cause: "unknown" }, ...captureValue.cells.slice(1)] };
    expect(() => validateWorkbookCapture(bad)).toThrow();
  });
  it("treats changing declared size as an unknown comparison", () => {
    const changed: RegionManifest = { ...manifest, cells: [
      { id: "a", bytes: 55, provenance: source }, ...manifest.cells.slice(1),
    ] };
    const next = captureWorkbook(changed, null, later);
    expect(compareWorkbook(allPresent(), next).rows[0]?.change).toBe("UNKNOWN");
  });
  it("preserves original source metadata in the first reading", () => {
    const first = allPresent();
    const changed: RegionManifest = { ...manifest, cells: [
      { id: "a", bytes: 0, provenance: { ...source, date: "2026-11-20" } }, ...manifest.cells.slice(1),
    ] };
    const next = captureWorkbook(changed, null, later);
    expect(first.cells[0]?.source.date).toBe("2026-11-19");
    expect(next.cells[0]?.source.date).toBe("2026-11-20");
  });
  it("preserves note data when replacing only the follow-up capture", () => {
    const initial = startWorkbook(allPresent());
    const note = { id: "n", cellId: "a", kind: "question" as const,
      disposition: "open" as const, text: "What changed?", at: later };
    const withNote = addWorkbookNote(initial, note);
    const updated = updateWorkbook(withNote, capture(["missing", "present", "present", "present"], later));
    expect(updated.notes).toEqual([note]);
  });
  it("preserves existing user-written notes after export and import", () => {
    const note = { id: "n", cellId: "a", kind: "observation" as const,
      disposition: "reviewing" as const, text: "Details supplied by the person", at: later };
    const withNote = addWorkbookNote(startWorkbook(allPresent()), note);
    const parsed = parseWorkbook(stringifyWorkbook(withNote), manifest.regionId);
    expect(parsed.notes[0]?.text).toBe(note.text);
  });
  it("does not return rows from the wrong region", () => {
    const before = allPresent();
    const foreign = { ...capture(["missing", "missing", "missing", "missing"], later), regionId: "foreign" };
    expect(() => compareWorkbook(before, foreign)).toThrow();
  });
  it("returns exact total after filtering a single changed row", () => {
    const result = compareWorkbook(allPresent(), capture(["missing", "present", "present", "present"], later));
    expect(pageWorkbook(result, { search: "", filter: "lost", sort: "listed", offset: 0, limit: 5 }).total).toBe(1);
  });
  it("does not use source text as a substitute for inventory evidence", () => {
    const unavailable = captureWorkbook(manifest, null, earlier);
    expect(unavailable.cells.every((cell) => cell.source.source === source.source)).toBe(true);
    expect(unavailable.cells.every((cell) => cell.state === "UNKNOWN")).toBe(true);
  });
  it("keeps workbook JSON deterministic across repeated exports", () => {
    const book = startWorkbook(allPresent());
    expect(stringifyWorkbook(book)).toBe(stringifyWorkbook(book));
  });
  it("does not fetch or mutate when paging local comparisons", () => {
    const first = allPresent();
    const second = capture(["present", "missing", "stale", "unreadable"], later);
    const result = compareWorkbook(first, second);
    const baseline = JSON.stringify(result);
    pageWorkbook(result, { search: "a", filter: "all", sort: "id", offset: 0, limit: 12 });
    expect(JSON.stringify(result)).toBe(baseline);
  });
});
