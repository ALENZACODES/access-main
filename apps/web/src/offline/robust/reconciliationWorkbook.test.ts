import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory, InventoryCause } from "./regionInventory";
import {
  addWorkbookNote, captureWorkbook, changeWorkbookNote, compareWorkbook, pageWorkbook,
  parseWorkbook, removeWorkbookNote, resetWorkbookComparison, startWorkbook, stringifyWorkbook,
  updateWorkbook, validateWorkbookCapture, workbookSummary, WORKBOOK_MAX_CELLS,
  WORKBOOK_MAX_NOTES, WORKBOOK_MAX_NOTE_CHARS, WORKBOOK_MAX_JSON_BYTES,
} from "./reconciliationWorkbook";

const beforeAt = "2026-11-20T05:00:00.000Z";
const afterAt = "2026-11-20T06:00:00.000Z";
const provenance = { source: "Ontario public source", licence: "Open Government Licence", date: "2026-11-01" };
const manifest: RegionManifest = {
  regionId: "ontario-test",
  cells: [
    { id: "north", bytes: 1024, provenance },
    { id: "south", bytes: 2048, provenance },
    { id: "east", bytes: 4096, provenance },
    { id: "west", bytes: 8192, provenance },
  ],
};
function cellAt(index: number): RegionManifest["cells"][number] {
  const cell = manifest.cells[index];
  if (cell === undefined) throw new Error("Test fixture is missing a cell");
  return cell;
}
function makeInventory(causes: readonly InventoryCause[]): RegionInventory {
  if (causes.length !== manifest.cells.length) throw new Error("Fixture causes are incomplete");
  const cells = manifest.cells.map((cell, index) => {
    const cause = causes[index];
    if (cause === undefined) throw new Error("Missing fixture cause");
    return { id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
      cause, state: cause === "present" ? "saved" as const : "unknown" as const };
  });
  const saved = cells.filter((cell) => cell.state === "saved");
  return { regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    expectedBytes: manifest.cells.reduce((sum, cell) => sum + cell.bytes, 0),
    complete: saved.length === cells.length };
}
const initial = () => captureWorkbook(manifest, makeInventory(["present", "missing", "unreadable", "stale"]), beforeAt);
const followUp = () => captureWorkbook(manifest, makeInventory(["missing", "present", "stale", "stale"]), afterAt);
const note = { id: "note-one", cellId: "north", kind: "observation" as const,
  disposition: "open" as const, text: "Check local copy manually", at: afterAt };

// Every test uses actual manifest and inventory shapes, not loosely typed casts.
describe("workbook capture", () => {
  it("preserves manifest order", () => {
    expect(initial().cells.map((cell) => cell.id)).toEqual(["north", "south", "east", "west"]);
  });
  it("preserves original source names", () => {
    expect(initial().cells[0]?.source.source).toBe(provenance.source);
  });
  it("preserves original open licences", () => {
    expect(initial().cells[0]?.source.licence).toBe(provenance.licence);
  });
  it("preserves original source dates", () => {
    expect(initial().cells[0]?.source.date).toBe(provenance.date);
  });
  it("preserves exact expected byte count", () => {
    expect(initial().cells[0]?.source.bytes).toBe(1024);
  });
  it("reads a present cell as saved", () => {
    expect(initial().cells[0]?.state).toBe("saved");
  });
  it("reads a missing cell as UNKNOWN", () => {
    expect(initial().cells[1]?.state).toBe("UNKNOWN");
  });
  it("preserves the distinct unreadable cause", () => {
    expect(initial().cells[2]?.cause).toBe("unreadable");
  });
  it("preserves the stale cause without claiming presence", () => {
    expect(initial().cells[3]).toMatchObject({ state: "UNKNOWN", cause: "stale" });
  });
  it("returns UNKNOWN for entirely absent inventory", () => {
    expect(captureWorkbook(manifest, null, beforeAt).status).toBe("UNKNOWN");
  });
  it("returns UNKNOWN for every cell when inventory is absent", () => {
    expect(captureWorkbook(manifest, null, beforeAt).cells.every((cell) => cell.cause === "UNKNOWN")).toBe(true);
  });
  it("returns UNKNOWN when region IDs differ", () => {
    const inventory = makeInventory(["present", "present", "present", "present"]);
    const wrongRegion = { ...inventory, regionId: "another-region" };
    expect(captureWorkbook(manifest, wrongRegion, beforeAt).status).toBe("UNKNOWN");
  });
  it("returns UNKNOWN for inventory with fewer cells", () => {
    const inventory = makeInventory(["present", "present", "present", "present"]);
    expect(captureWorkbook(manifest, { ...inventory, cells: inventory.cells.slice(1) }, beforeAt).status).toBe("UNKNOWN");
  });
  it("returns UNKNOWN for inventory with repeated IDs", () => {
    const inventory = makeInventory(["present", "present", "present", "present"]);
    const replacement = inventory.cells[0];
    if (replacement === undefined) throw new Error("Missing fixture cell");
    expect(captureWorkbook(manifest, { ...inventory, cells: [replacement, replacement, ...inventory.cells.slice(2)] }, beforeAt).status).toBe("UNKNOWN");
  });
  it("returns UNKNOWN when provenance source differs", () => {
    const inventory = makeInventory(["present", "present", "present", "present"]);
    const changed = [{ ...inventory.cells[0]!, provenance: { ...provenance, source: "Different source" } }, ...inventory.cells.slice(1)];
    expect(captureWorkbook(manifest, { ...inventory, cells: changed }, beforeAt).cells[0]?.state).toBe("UNKNOWN");
  });
  it("returns UNKNOWN when provenance licence differs", () => {
    const inventory = makeInventory(["present", "present", "present", "present"]);
    const changed = [{ ...inventory.cells[0]!, provenance: { ...provenance, licence: "Changed licence" } }, ...inventory.cells.slice(1)];
    expect(captureWorkbook(manifest, { ...inventory, cells: changed }, beforeAt).cells[0]?.state).toBe("UNKNOWN");
  });
  it("returns UNKNOWN when provenance date differs", () => {
    const inventory = makeInventory(["present", "present", "present", "present"]);
    const changed = [{ ...inventory.cells[0]!, provenance: { ...provenance, date: "2026-10-01" } }, ...inventory.cells.slice(1)];
    expect(captureWorkbook(manifest, { ...inventory, cells: changed }, beforeAt).cells[0]?.state).toBe("UNKNOWN");
  });
  it("returns UNKNOWN when expected bytes differ", () => {
    const inventory = makeInventory(["present", "present", "present", "present"]);
    const changed = [{ ...inventory.cells[0]!, expectedBytes: 11 }, ...inventory.cells.slice(1)];
    expect(captureWorkbook(manifest, { ...inventory, cells: changed }, beforeAt).cells[0]?.state).toBe("UNKNOWN");
  });
  it("returns UNKNOWN for inconsistent state/cause pairs", () => {
    const inventory = makeInventory(["present", "present", "present", "present"]);
    const changed = [{ ...inventory.cells[0]!, state: "unknown" as const }, ...inventory.cells.slice(1)];
    expect(captureWorkbook(manifest, { ...inventory, cells: changed }, beforeAt).cells[0]?.state).toBe("UNKNOWN");
  });
  it("rejects repeated manifest IDs", () => {
    expect(() => captureWorkbook({ ...manifest, cells: [cellAt(0), cellAt(0)] }, null, beforeAt)).toThrow();
  });
  it("rejects empty region ID", () => {
    expect(() => captureWorkbook({ ...manifest, regionId: " " }, null, beforeAt)).toThrow();
  });
  it("rejects empty cell ID", () => {
    expect(() => captureWorkbook({ ...manifest, cells: [{ ...cellAt(0), id: " " }] }, null, beforeAt)).toThrow();
  });
  it("rejects negative manifest bytes", () => {
    expect(() => captureWorkbook({ ...manifest, cells: [{ ...cellAt(0), bytes: -1 }] }, null, beforeAt)).toThrow();
  });
  it("rejects fractional manifest bytes", () => {
    expect(() => captureWorkbook({ ...manifest, cells: [{ ...cellAt(0), bytes: 0.5 }] }, null, beforeAt)).toThrow();
  });
  it("rejects impossible source dates", () => {
    expect(() => captureWorkbook({ ...manifest, cells: [{ ...cellAt(0), provenance: { ...provenance, date: "2026-02-31" } }] }, null, beforeAt)).toThrow();
  });
  it("rejects timestamp without time", () => {
    expect(() => captureWorkbook(manifest, null, "2026-11-20")).toThrow();
  });
  it("rejects timestamp without zone", () => {
    expect(() => captureWorkbook(manifest, null, "2026-11-20T05:00:00")).toThrow();
  });
  it("rejects timestamp with invalid minutes", () => {
    expect(() => captureWorkbook(manifest, null, "2026-11-20T05:99:00Z")).toThrow();
  });
  it("rejects more than the cell limit", () => {
    expect(() => captureWorkbook({ ...manifest, cells: Array.from({ length: WORKBOOK_MAX_CELLS + 1 }, (_, index) =>
      ({ id: `cell-${index}`, bytes: 1, provenance })) }, null, beforeAt)).toThrow();
  });
});

describe("workbook comparison", () => {
  it("detects loss", () => {
    expect(compareWorkbook(initial(), followUp()).rows[0]?.change).toBe("lost");
  });
  it("detects gain", () => {
    expect(compareWorkbook(initial(), followUp()).rows[1]?.change).toBe("gained");
  });
  it("detects different unknown causes", () => {
    expect(compareWorkbook(initial(), followUp()).rows[2]?.change).toBe("changed");
  });
  it("detects unchanged stale cell", () => {
    expect(compareWorkbook(initial(), followUp()).rows[3]?.change).toBe("unchanged");
  });
  it("counts all categories without mutation", () => {
    expect(compareWorkbook(initial(), followUp()).counts).toEqual({ unchanged: 1, lost: 1, gained: 1, changed: 1, UNKNOWN: 0 });
  });
  it("uses review guidance rather than modifying cells", () => {
    expect(compareWorkbook(initial(), followUp()).rows[0]?.action).toBe("consider-download");
  });
  it("does not suggest intervention for unchanged cells", () => {
    expect(compareWorkbook(initial(), followUp()).rows[3]?.action).toBe("none");
  });
  it("retains recorded status for consistent observations", () => {
    expect(compareWorkbook(initial(), followUp()).status).toBe("recorded");
  });
  it("returns UNKNOWN for follow-up inventory absence", () => {
    expect(compareWorkbook(initial(), captureWorkbook(manifest, null, afterAt)).status).toBe("UNKNOWN");
  });
  it("does not mistake missing readings for a lost copy", () => {
    const result = compareWorkbook(initial(), captureWorkbook(manifest, null, afterAt));
    expect(result.rows[0]?.change).toBe("UNKNOWN");
  });
  it("does not mistake changed source dates for a gained copy", () => {
    const manifestAfter: RegionManifest = { ...manifest, cells: [
      { ...cellAt(0), provenance: { ...provenance, date: "2026-11-02" } }, ...manifest.cells.slice(1),
    ] };
    const next = captureWorkbook(manifestAfter, null, afterAt);
    expect(compareWorkbook(initial(), next).rows[0]?.change).toBe("UNKNOWN");
  });
  it("marks changed source metadata", () => {
    const manifestAfter: RegionManifest = { ...manifest, cells: [
      { ...cellAt(0), provenance: { ...provenance, date: "2026-11-02" } }, ...manifest.cells.slice(1),
    ] };
    expect(compareWorkbook(initial(), captureWorkbook(manifestAfter, null, afterAt)).rows[0]?.sourceChanged).toBe(true);
  });
  it("rejects different region IDs", () => {
    expect(() => compareWorkbook(initial(), { ...followUp(), regionId: "other" })).toThrow();
  });
  it("rejects reverse-ordered capture times", () => {
    expect(() => compareWorkbook(followUp(), initial())).toThrow();
  });
  it("reports unknown on added cells", () => {
    const next = captureWorkbook({ ...manifest, cells: [...manifest.cells, { id: "extra", bytes: 1, provenance }] }, null, afterAt);
    expect(compareWorkbook(initial(), next).rows.at(-1)?.change).toBe("UNKNOWN");
  });
  it("reports unknown on removed cells", () => {
    const next = captureWorkbook({ ...manifest, cells: manifest.cells.slice(1) }, null, afterAt);
    expect(compareWorkbook(initial(), next).rows[0]?.change).toBe("UNKNOWN");
  });
  it("retains deterministic manifest order", () => {
    expect(compareWorkbook(initial(), followUp()).rows.map((row) => row.id)).toEqual(["north", "south", "east", "west"]);
  });
});

describe("workbook note lifecycle", () => {
  it("starts with no later reading", () => {
    expect(startWorkbook(initial()).after).toBeNull();
  });
  it("starts with no notes", () => {
    expect(startWorkbook(initial()).notes).toEqual([]);
  });
  it("uses the first capture time as workbook start", () => {
    expect(startWorkbook(initial()).startedAt).toBe(beforeAt);
  });
  it("adds a follow-up reading", () => {
    expect(updateWorkbook(startWorkbook(initial()), followUp()).after?.capturedAt).toBe(afterAt);
  });
  it("replaces a follow-up without changing the starting reading", () => {
    const first = startWorkbook(initial());
    const updated = updateWorkbook(first, followUp());
    expect(first.after).toBeNull();
    expect(updated.before).toEqual(first.before);
  });
  it("resets only the follow-up reading", () => {
    const changed = updateWorkbook(startWorkbook(initial()), followUp());
    expect(resetWorkbookComparison(changed).before).toEqual(changed.before);
    expect(resetWorkbookComparison(changed).after).toBeNull();
  });
  it("adds a note for a listed cell", () => {
    expect(addWorkbookNote(startWorkbook(initial()), note).notes).toEqual([note]);
  });
  it("does not mutate prior note list", () => {
    const before = startWorkbook(initial());
    addWorkbookNote(before, note);
    expect(before.notes).toEqual([]);
  });
  it("rejects note for an unlisted cell", () => {
    expect(() => addWorkbookNote(startWorkbook(initial()), { ...note, cellId: "not-listed" })).toThrow();
  });
  it("rejects repeated note IDs", () => {
    const book = addWorkbookNote(startWorkbook(initial()), note);
    expect(() => addWorkbookNote(book, note)).toThrow();
  });
  it("rejects an empty note", () => {
    expect(() => addWorkbookNote(startWorkbook(initial()), { ...note, text: " " })).toThrow();
  });
  it("rejects oversized notes", () => {
    expect(() => addWorkbookNote(startWorkbook(initial()), { ...note, text: "x".repeat(WORKBOOK_MAX_NOTE_CHARS + 1) })).toThrow();
  });
  it("rejects note times before first reading", () => {
    expect(() => addWorkbookNote(startWorkbook(initial()), { ...note, at: "2026-11-19T05:00:00.000Z" })).toThrow();
  });
  it("rejects unsupported note classifications", () => {
    expect(() => addWorkbookNote(startWorkbook(initial()), { ...note, kind: "else" as "observation" })).toThrow();
  });
  it("rejects invalid note dispositions", () => {
    expect(() => addWorkbookNote(startWorkbook(initial()), { ...note, disposition: "else" as "open" })).toThrow();
  });
  it("rejects invalid note timestamps", () => {
    expect(() => addWorkbookNote(startWorkbook(initial()), { ...note, at: "today" })).toThrow();
  });
  it("marks note under review", () => {
    const book = addWorkbookNote(startWorkbook(initial()), note);
    expect(changeWorkbookNote(book, note.id, "reviewing").notes[0]?.disposition).toBe("reviewing");
  });
  it("closes a note without changing files", () => {
    const book = addWorkbookNote(startWorkbook(initial()), note);
    expect(changeWorkbookNote(book, note.id, "closed").notes[0]?.disposition).toBe("closed");
  });
  it("does not mutate the original disposition", () => {
    const book = addWorkbookNote(startWorkbook(initial()), note);
    changeWorkbookNote(book, note.id, "closed");
    expect(book.notes[0]?.disposition).toBe("open");
  });
  it("rejects changing a missing note", () => {
    expect(() => changeWorkbookNote(startWorkbook(initial()), "absent", "closed")).toThrow();
  });
  it("rejects unsupported disposition update", () => {
    const book = addWorkbookNote(startWorkbook(initial()), note);
    expect(() => changeWorkbookNote(book, note.id, "else" as "open")).toThrow();
  });
  it("removes one selected note", () => {
    const book = addWorkbookNote(startWorkbook(initial()), note);
    expect(removeWorkbookNote(book, note.id).notes).toEqual([]);
  });
  it("rejects removing a missing note", () => {
    expect(() => removeWorkbookNote(startWorkbook(initial()), "absent")).toThrow();
  });
  it("caps the total number of notes", () => {
    const book = { ...startWorkbook(initial()), notes: Array.from({ length: WORKBOOK_MAX_NOTES }, (_, i) =>
      ({ ...note, id: `note-${i}` })) };
    expect(() => addWorkbookNote(book, { ...note, id: "overflow" })).toThrow();
  });
  it("preserves text as inert data", () => {
    const book = addWorkbookNote(startWorkbook(initial()), { ...note, text: "<script>alert(1)</script>" });
    expect(book.notes[0]?.text).toBe("<script>alert(1)</script>");
  });
});

describe("workbook pagination and search", () => {
  const comparison = compareWorkbook(initial(), followUp());
  const query = (overrides: Partial<Parameters<typeof pageWorkbook>[1]> = {}) =>
    pageWorkbook(comparison, { search: "", filter: "all", sort: "listed", offset: 0, limit: 2, ...overrides });
  it("paginates the first two rows", () => {
    expect(query().rows.map((row) => row.id)).toEqual(["north", "south"]);
  });
  it("paginates the last two rows", () => {
    expect(query({ offset: 2 }).rows.map((row) => row.id)).toEqual(["east", "west"]);
  });
  it("exposes the previous-page marker", () => {
    expect(query({ offset: 2 }).previous).toBe(true);
  });
  it("exposes the next-page marker", () => {
    expect(query().next).toBe(true);
  });
  it("does not report next page past end", () => {
    expect(query({ offset: 2 }).next).toBe(false);
  });
  it("returns empty rows after end", () => {
    expect(query({ offset: 200 }).rows).toEqual([]);
  });
  it("retains total after an out-of-range page", () => {
    expect(query({ offset: 200 }).total).toBe(4);
  });
  it("filters lost local copies", () => {
    expect(query({ filter: "lost" }).rows.map((row) => row.id)).toEqual(["north"]);
  });
  it("filters gained local copies", () => {
    expect(query({ filter: "gained" }).rows.map((row) => row.id)).toEqual(["south"]);
  });
  it("filters saved follow-up copies", () => {
    expect(query({ filter: "saved" }).rows.map((row) => row.id)).toEqual(["south"]);
  });
  it("filters attention rows", () => {
    expect(query({ filter: "attention" }).total).toBe(3);
  });
  it("filters unknown changes when observations missing", () => {
    const uncertain = compareWorkbook(initial(), captureWorkbook(manifest, null, afterAt));
    expect(pageWorkbook(uncertain, { search: "", filter: "UNKNOWN", sort: "listed", offset: 0, limit: 12 }).total).toBe(4);
  });
  it("searches cell IDs case insensitively", () => {
    expect(query({ search: "NORTH" }).rows.map((row) => row.id)).toEqual(["north"]);
  });
  it("searches the source name case insensitively", () => {
    expect(query({ search: "ONTARIO" }).total).toBe(4);
  });
  it("searches the licence", () => {
    expect(query({ search: "government" }).total).toBe(4);
  });
  it("returns no rows for absent identifiers", () => {
    expect(query({ search: "nowhere" }).total).toBe(0);
  });
  it("sorts identifiers in ascending order", () => {
    expect(query({ sort: "id", limit: 4 }).rows.map((row) => row.id)).toEqual(["east", "north", "south", "west"]);
  });
  it("sorts largest byte size first", () => {
    expect(query({ sort: "bytes", limit: 4 }).rows.map((row) => row.id)).toEqual(["west", "east", "south", "north"]);
  });
  it("sorts changed categories deterministically", () => {
    expect(query({ sort: "change", limit: 4 }).rows.map((row) => row.change)).toEqual(["changed", "gained", "lost", "unchanged"]);
  });
  it("rejects negative offset", () => {
    expect(() => query({ offset: -1 })).toThrow();
  });
  it("rejects fractional offset", () => {
    expect(() => query({ offset: 1.1 })).toThrow();
  });
  it("rejects infinite offset", () => {
    expect(() => query({ offset: Infinity })).toThrow();
  });
  it("rejects NaN offset", () => {
    expect(() => query({ offset: NaN })).toThrow();
  });
  it("rejects zero limit", () => {
    expect(() => query({ limit: 0 })).toThrow();
  });
  it("rejects limit above maximum", () => {
    expect(() => query({ limit: 51 })).toThrow();
  });
  it("rejects fractional limit", () => {
    expect(() => query({ limit: 1.5 })).toThrow();
  });
  it("rejects unsupported sort", () => {
    expect(() => query({ sort: "other" as "listed" })).toThrow();
  });
  it("rejects unsupported filter", () => {
    expect(() => query({ filter: "other" as "all" })).toThrow();
  });
  it("rejects searches longer than 160 characters", () => {
    expect(() => query({ search: "q".repeat(161) })).toThrow();
  });
});

describe("workbook serialization and import boundaries", () => {
  it("round trips an empty workbook", () => {
    const book = startWorkbook(initial());
    expect(parseWorkbook(stringifyWorkbook(book), manifest.regionId)).toEqual(book);
  });
  it("round trips a workbook with a follow-up", () => {
    const book = updateWorkbook(startWorkbook(initial()), followUp());
    expect(parseWorkbook(stringifyWorkbook(book), manifest.regionId)).toEqual(book);
  });
  it("round trips a workbook with a note", () => {
    const book = addWorkbookNote(startWorkbook(initial()), note);
    expect(parseWorkbook(stringifyWorkbook(book), manifest.regionId)).toEqual(book);
  });
  it("round trips a closed note", () => {
    const book = changeWorkbookNote(addWorkbookNote(startWorkbook(initial()), note), note.id, "closed");
    expect(parseWorkbook(stringifyWorkbook(book), manifest.regionId)).toEqual(book);
  });
  it("rejects wrong-region imports", () => {
    expect(() => parseWorkbook(stringifyWorkbook(startWorkbook(initial())), "another-region")).toThrow();
  });
  it("rejects invalid JSON", () => {
    expect(() => parseWorkbook("{", manifest.regionId)).toThrow();
  });
  it("rejects unsupported file format", () => {
    expect(() => parseWorkbook('{"format":"other"}', manifest.regionId)).toThrow();
  });
  it("rejects JSON larger than the byte boundary", () => {
    expect(() => parseWorkbook("a".repeat(WORKBOOK_MAX_JSON_BYTES + 1), manifest.regionId)).toThrow();
  });
  it("rejects tampered start timestamp", () => {
    const book = startWorkbook(initial());
    expect(() => parseWorkbook(JSON.stringify({ ...book, startedAt: afterAt }), manifest.regionId)).toThrow();
  });
  it("rejects tampered region inside first capture", () => {
    const book = startWorkbook(initial());
    expect(() => parseWorkbook(JSON.stringify({ ...book, before: { ...book.before, regionId: "other" } }), manifest.regionId)).toThrow();
  });
  it("rejects a forward capture with another region", () => {
    const book = updateWorkbook(startWorkbook(initial()), followUp());
    expect(() => parseWorkbook(JSON.stringify({ ...book, after: { ...book.after, regionId: "other" } }), manifest.regionId)).toThrow();
  });
  it("rejects a missing notes collection", () => {
    const book = startWorkbook(initial());
    const object = { ...book, notes: undefined };
    expect(() => parseWorkbook(JSON.stringify(object), manifest.regionId)).toThrow();
  });
  it("rejects an imported note that predates capture", () => {
    const book = startWorkbook(initial());
    const invalid = { ...book, notes: [{ ...note, at: "2026-11-19T04:00:00.000Z" }] };
    expect(() => parseWorkbook(JSON.stringify(invalid), manifest.regionId)).toThrow();
  });
  it("rejects imported note with missing source cell", () => {
    const book = startWorkbook(initial());
    const invalid = { ...book, notes: [{ ...note, cellId: "unlisted" }] };
    expect(() => parseWorkbook(JSON.stringify(invalid), manifest.regionId)).toThrow();
  });
  it("rejects imported note without a category", () => {
    const book = startWorkbook(initial());
    const invalid = { ...book, notes: [{ ...note, kind: undefined }] };
    expect(() => parseWorkbook(JSON.stringify(invalid), manifest.regionId)).toThrow();
  });
  it("rejects duplicate note IDs from imported history", () => {
    const book = startWorkbook(initial());
    const invalid = { ...book, notes: [note, note] };
    expect(() => parseWorkbook(JSON.stringify(invalid), manifest.regionId)).toThrow();
  });
  it("rejects imported empty note text", () => {
    const book = startWorkbook(initial());
    const invalid = { ...book, notes: [{ ...note, text: "" }] };
    expect(() => parseWorkbook(JSON.stringify(invalid), manifest.regionId)).toThrow();
  });
  it("rejects an imported invalid disposition", () => {
    const book = startWorkbook(initial());
    const invalid = { ...book, notes: [{ ...note, disposition: "invalid" }] };
    expect(() => parseWorkbook(JSON.stringify(invalid), manifest.regionId)).toThrow();
  });
  it("rejects non-object imported notes", () => {
    const book = startWorkbook(initial());
    expect(() => parseWorkbook(JSON.stringify({ ...book, notes: [null] }), manifest.regionId)).toThrow();
  });
  it("rejects forged saved/absent mismatch", () => {
    const value = initial();
    const changed = { ...value, cells: [{ ...value.cells[0]!, cause: "missing" }, ...value.cells.slice(1)] };
    expect(() => validateWorkbookCapture(changed)).toThrow();
  });
  it("rejects forged unknown/present mismatch", () => {
    const value = initial();
    const changed = { ...value, cells: [{ ...value.cells[0]!, state: "UNKNOWN" }, ...value.cells.slice(1)] };
    expect(() => validateWorkbookCapture(changed)).toThrow();
  });
  it("rejects duplicate imported cell IDs", () => {
    const value = initial();
    const first = value.cells[0];
    if (first === undefined) throw new Error("Missing fixture cell");
    expect(() => validateWorkbookCapture({ ...value, cells: [first, first] })).toThrow();
  });
  it("rejects status that hides UNKNOWN causes", () => {
    const value = captureWorkbook(manifest, null, beforeAt);
    expect(() => validateWorkbookCapture({ ...value, status: "recorded" })).toThrow();
  });
  it("rejects invalid source date in imported capture", () => {
    const value = initial();
    const changed = { ...value, cells: [{ ...value.cells[0]!, source: { ...value.cells[0]!.source, date: "2026-14-14" } }, ...value.cells.slice(1)] };
    expect(() => validateWorkbookCapture(changed)).toThrow();
  });
  it("rejects invalid source byte count in imported capture", () => {
    const value = initial();
    const changed = { ...value, cells: [{ ...value.cells[0]!, source: { ...value.cells[0]!.source, bytes: -100 } }, ...value.cells.slice(1)] };
    expect(() => validateWorkbookCapture(changed)).toThrow();
  });
  it("rejects missing open licence", () => {
    const value = initial();
    const changed = { ...value, cells: [{ ...value.cells[0]!, source: { ...value.cells[0]!.source, licence: "" } }, ...value.cells.slice(1)] };
    expect(() => validateWorkbookCapture(changed)).toThrow();
  });
  it("rejects extra-long identifiers", () => {
    const value = initial();
    expect(() => validateWorkbookCapture({ ...value, regionId: "x".repeat(161) })).toThrow();
  });
  it("rejects control characters in imported identifiers", () => {
    const value = initial();
    expect(() => validateWorkbookCapture({ ...value, regionId: "bad\u0000id" })).toThrow();
  });
  it("rejects unsupported cell state", () => {
    const value = initial();
    const changed = { ...value, cells: [{ ...value.cells[0]!, state: "ready" }, ...value.cells.slice(1)] };
    expect(() => validateWorkbookCapture(changed)).toThrow();
  });
  it("rejects unsupported cause", () => {
    const value = initial();
    const changed = { ...value, cells: [{ ...value.cells[0]!, cause: "reliable" }, ...value.cells.slice(1)] };
    expect(() => validateWorkbookCapture(changed)).toThrow();
  });
});

describe("workbook summaries", () => {
  it("counts listed manifest cells", () => {
    expect(workbookSummary(startWorkbook(initial())).listed).toBe(4);
  });
  it("counts saved starting cells", () => {
    expect(workbookSummary(startWorkbook(initial())).beforeSaved).toBe(1);
  });
  it("does not invent a later count", () => {
    expect(workbookSummary(startWorkbook(initial())).afterSaved).toBeNull();
  });
  it("does not invent a change count before follow-up", () => {
    expect(workbookSummary(startWorkbook(initial())).changed).toBeNull();
  });
  it("counts saved follow-up cells", () => {
    expect(workbookSummary(updateWorkbook(startWorkbook(initial()), followUp())).afterSaved).toBe(1);
  });
  it("counts changed rows including new local observations", () => {
    expect(workbookSummary(updateWorkbook(startWorkbook(initial()), followUp())).changed).toBe(3);
  });
  it("counts saved bytes before follow-up", () => {
    expect(workbookSummary(startWorkbook(initial())).bytesBefore).toBe(1024);
  });
  it("counts saved bytes after follow-up", () => {
    expect(workbookSummary(updateWorkbook(startWorkbook(initial()), followUp())).bytesAfter).toBe(2048);
  });
  it("counts an open note", () => {
    expect(workbookSummary(addWorkbookNote(startWorkbook(initial()), note)).openNotes).toBe(1);
  });
  it("counts a reviewing note", () => {
    const book = changeWorkbookNote(addWorkbookNote(startWorkbook(initial()), note), note.id, "reviewing");
    expect(workbookSummary(book).reviewingNotes).toBe(1);
  });
  it("counts a closed note", () => {
    const book = changeWorkbookNote(addWorkbookNote(startWorkbook(initial()), note), note.id, "closed");
    expect(workbookSummary(book).closedNotes).toBe(1);
  });
  it("preserves unknown as a distinct tally", () => {
    const book = updateWorkbook(startWorkbook(initial()), captureWorkbook(manifest, null, afterAt));
    expect(workbookSummary(book).unknown).toBe(4);
  });
});
