import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import {
  addDependency, assessDependency, createDependencyBook, editDependency, pageDependencies, parseDependencyBook,
  removeDependency, renameOuting, serializeDependencyBook, summarizeDependencies, validDependencyDate,
  validateDependencyBook, type DependencyBook, type DependencyItem, type DependencyPriority,
  DEPENDENCY_MAX_IMPORT_BYTES, DEPENDENCY_MAX_ITEMS,
} from "./dependencyPlanner";

const provenance = { source: "Sample open data", licence: "OGL", date: "2026-01-01" };
const otherProvenance = { ...provenance, date: "2026-03-01" };
const manifest: RegionManifest = { regionId: "ontario-demo", cells: [
  { id: "entrance", bytes: 104, provenance },
  { id: "transit", bytes: 311, provenance: otherProvenance },
  { id: "washroom", bytes: 500, provenance },
] };
const inventory: RegionInventory = {
  regionId: "ontario-demo", cells: manifest.cells.map((c) => ({ id: c.id, state: "saved" as const,
    cause: "present" as const, expectedBytes: c.bytes, provenance: c.provenance })),
  complete: true, savedCount: 3, unknownCount: 0, savedBytes: 915, expectedBytes: 915,
};
const rawItem: Omit<DependencyItem, "createdOn" | "changedOn"> = {
  id: "question-1", category: "entrance", title: "Find entrance information", purpose: "Understand a listed entrance",
  cellIds: ["entrance"], priority: "essential", progress: "not-reviewed", note: "",
};
const base = (): DependencyBook => createDependencyBook("ontario-demo", "Outing", "2026-02-01");
const one = (): DependencyBook => addDependency(base(), rawItem, "2026-02-03");
const two = (): DependencyBook => addDependency(one(), { ...rawItem, id: "question-2", title: "Check transport", priority: "useful", cellIds: ["transit"] }, "2026-02-04");
const unsafe = (mutate: (copy: Record<string, unknown>) => void): string => {
  const clone = JSON.parse(serializeDependencyBook(one())) as Record<string, unknown>;
  mutate(clone);
  return JSON.stringify(clone);
};
function expectReject(raw: string): void { expect(() => parseDependencyBook(raw, "ontario-demo")).toThrow(); }

describe("offline dependency planner: immutable editing", () => {
  it("starts empty and with an explicit version", () => {
    const book = base();
    expect(book.schema).toBe("offline-dependency-book-v1");
    expect(book.items).toEqual([]);
    expect(book.changedOn).toBe(book.createdOn);
  });
  it("adds a checkpoint without changing the original", () => {
    const old = base();
    const fresh = addDependency(old, rawItem, "2026-02-03");
    expect(old.items).toHaveLength(0);
    expect(fresh.items[0]?.title).toBe(rawItem.title);
    expect(fresh.changedOn).toBe("2026-02-03");
  });
  it("records independent immutable cell ID lists", () => {
    const ids = ["entrance"];
    const next = addDependency(base(), { ...rawItem, cellIds: ids }, "2026-02-03");
    ids.push("washroom");
    expect(next.items[0]?.cellIds).toEqual(["entrance"]);
  });
  it("changes a note without changing the former record", () => {
    const old = one();
    const next = editDependency(old, "question-1", { note: "Phone call pending", progress: "asked" }, "2026-02-04");
    expect(old.items[0]?.note).toBe("");
    expect(next.items[0]?.note).toBe("Phone call pending");
    expect(next.items[0]?.progress).toBe("asked");
  });
  it("does not change item order when editing", () => {
    const next = editDependency(two(), "question-1", { title: "A" }, "2026-02-05");
    expect(next.items.map((item) => item.id)).toEqual(["question-1", "question-2"]);
  });
  it("removes only the selected checkpoint", () => {
    const next = removeDependency(two(), "question-1", "2026-02-05");
    expect(next.items.map((item) => item.id)).toEqual(["question-2"]);
  });
  it("renames the outing without editing checkpoints", () => {
    const old = one();
    const next = renameOuting(old, "Another outing", "2026-02-05");
    expect(next.outingLabel).toBe("Another outing");
    expect(next.items).toEqual(old.items);
  });
  it("rejects duplicate IDs", () => {
    expect(() => addDependency(one(), rawItem, "2026-02-04")).toThrow();
  });
  it("rejects a missing ID when editing", () => {
    expect(() => editDependency(one(), "absent", { note: "Hi" }, "2026-02-04")).toThrow();
  });
  it("rejects a missing ID when removing", () => {
    expect(() => removeDependency(one(), "absent", "2026-02-04")).toThrow();
  });
  it("rejects backdated edit", () => {
    expect(() => editDependency(one(), "question-1", { note: "A" }, "2026-02-02")).toThrow();
  });
  it("rejects backdated removal", () => {
    expect(() => removeDependency(one(), "question-1", "2026-01-01")).toThrow();
  });
  it("rejects backdated rename", () => {
    expect(() => renameOuting(one(), "Another", "2026-02-02")).toThrow();
  });
  it("rejects unsupported patch keys", () => {
    expect(() => editDependency(one(), "question-1", { id: "stolen" } as never, "2026-02-04")).toThrow();
  });
  it("rejects blank title", () => {
    expect(() => addDependency(base(), { ...rawItem, title: "  " }, "2026-02-03")).toThrow();
  });
  it("rejects duplicate dependency cell IDs", () => {
    expect(() => addDependency(base(), { ...rawItem, cellIds: ["entrance", "entrance"] }, "2026-02-03")).toThrow();
  });
  it("rejects excess dependency cell IDs", () => {
    expect(() => addDependency(base(), { ...rawItem, cellIds: Array.from({ length: 33 }, (_, i) => String(i)) }, "2026-02-03")).toThrow();
  });
  it("rejects overlong personal notes", () => {
    expect(() => addDependency(base(), { ...rawItem, note: "x".repeat(1201) }, "2026-02-03")).toThrow();
  });
  it("rejects control characters in notes", () => {
    expect(() => addDependency(base(), { ...rawItem, note: "bad\u0001" }, "2026-02-03")).toThrow();
  });
  it("allows a note with normal line breaks", () => {
    const book = addDependency(base(), { ...rawItem, note: "First line\nSecond line" }, "2026-02-03");
    expect(book.items[0]?.note).toContain("\n");
  });
  it("rejects unrecognized categories", () => {
    expect(() => addDependency(base(), { ...rawItem, category: "stairs" as never }, "2026-02-03")).toThrow();
  });
  it("rejects unsupported priority", () => {
    expect(() => addDependency(base(), { ...rawItem, priority: "urgent" as never }, "2026-02-03")).toThrow();
  });
  it("rejects unsupported progress", () => {
    expect(() => addDependency(base(), { ...rawItem, progress: "done" as never }, "2026-02-03")).toThrow();
  });
  it("rejects a creation date before the book date", () => {
    expect(() => addDependency(base(), rawItem, "2026-01-31")).toThrow();
  });
  it("enforces a real item-count limit", () => {
    let book = base();
    for (let i = 0; i < DEPENDENCY_MAX_ITEMS; i++) book = addDependency(book, { ...rawItem, id: `item-${i}` }, "2026-02-03");
    expect(book.items).toHaveLength(DEPENDENCY_MAX_ITEMS);
    expect(() => addDependency(book, { ...rawItem, id: "extra" }, "2026-02-03")).toThrow();
  });
});

describe("offline dependency planner: validation and bounded import", () => {
  it("round-trips with a final newline", () => {
    const original = two();
    const json = serializeDependencyBook(original);
    expect(json.endsWith("\n")).toBe(true);
    expect(parseDependencyBook(json, "ontario-demo")).toEqual(original);
  });
  it("does not leak the original cell array through imported records", () => {
    const original = two();
    const imported = parseDependencyBook(serializeDependencyBook(original), "ontario-demo");
    expect(imported.items[0]?.cellIds).toEqual(original.items[0]?.cellIds);
    expect(imported.items[0]).not.toBe(original.items[0]);
  });
  it("rejects an incorrect region", () => expectReject(serializeDependencyBook(one()).replace('"regionId": "ontario-demo"', '"regionId": "other"')));
  it("rejects malformed JSON", () => expectReject("{no"));
  it("rejects an unsupported schema", () => expectReject(unsafe((r) => { r.schema = "book-v3"; })));
  it("rejects a missing schema", () => expectReject(unsafe((r) => { delete r.schema; })));
  it("rejects missing item array", () => expectReject(unsafe((r) => { delete r.items; })));
  it("rejects duplicate IDs in imported arrays", () => expectReject(unsafe((r) => { r.items = [one().items[0], one().items[0]]; })));
  it("rejects a foreign item field", () => expectReject(unsafe((r) => { r.items = [{ ...one().items[0], verified: true }]; })));
  it("rejects an unknown item state", () => expectReject(unsafe((r) => { r.items = [{ ...one().items[0], progress: "completed" }]; })));
  it("rejects an invalid source chronology", () => expectReject(unsafe((r) => { r.items = [{ ...one().items[0], changedOn: "2026-01-01" }]; })));
  it("rejects an item changed after the book date", () => expectReject(unsafe((r) => { r.items = [{ ...one().items[0], changedOn: "2029-01-01" }]; })));
  it("rejects an oversized import before parsing", () => expectReject("x".repeat(DEPENDENCY_MAX_IMPORT_BYTES + 1)));
  it("rejects an array top-level", () => expectReject("[]"));
  it("rejects null top-level", () => expectReject("null"));
  it("rejects missing title", () => expectReject(unsafe((r) => { r.items = [{ id: "x" }]; })));
  it("rejects duplicate cell IDs in import", () => expectReject(unsafe((r) => { r.items = [{ ...one().items[0], cellIds: ["a", "a"] }]; })));
  it("rejects non-array cell IDs", () => expectReject(unsafe((r) => { r.items = [{ ...one().items[0], cellIds: "a" }]; })));
  it("rejects a boolean title", () => expectReject(unsafe((r) => { r.items = [{ ...one().items[0], title: true }]; })));
  it("rejects non-object items", () => expectReject(unsafe((r) => { r.items = [null]; })));
  it("accepts an empty dependency list", () => {
    validateDependencyBook(base());
    expect(parseDependencyBook(serializeDependencyBook(base()), "ontario-demo").items).toHaveLength(0);
  });
  for (const date of ["2024-02-29", "2026-12-31", "2000-02-29"]) it(`accepts real date ${date}`, () => {
    expect(validDependencyDate(date)).toBe(true);
  });
  for (const date of ["2026-02-29", "2026-13-01", "2026-00-01", "2026-04-31", "2026/01/01", "bad", "", "2026-01-01\n"]) it(`rejects invalid date ${date}`, () => {
    expect(validDependencyDate(date)).toBe(false);
  });
});

describe("offline dependency planner: conservative device evidence", () => {
  it("does not claim physical accessibility even when every cell is saved", () => {
    const value = assessDependency(one(), manifest, inventory)[0];
    expect(value?.availability).toBe("saved");
    expect(value?.physicalAccess).toBe("UNKNOWN");
  });
  it("never treats no selected cell as saved", () => {
    const book = addDependency(base(), { ...rawItem, cellIds: [] }, "2026-02-03");
    expect(assessDependency(book, manifest, inventory)[0]?.availability).toBe("UNKNOWN");
  });
  it("keeps a checkpoint unresolved when a region listing is unavailable, even with inventory", () => {
    const row = assessDependency(one(), null, inventory)[0];
    expect(row?.cells).toEqual([{
      cellId: "entrance", availability: "UNKNOWN", expectedBytes: null, source: null, reason: "listing-unavailable",
    }]);
    expect(row?.availability).toBe("UNKNOWN");
    expect(row?.physicalAccess).toBe("UNKNOWN");
  });
  it("does not treat missing inventory as saved", () => {
    expect(assessDependency(one(), manifest, null)[0]?.availability).toBe("UNKNOWN");
  });
  it("does not silently align inventory from another region", () => {
    expect(assessDependency(one(), manifest, { ...inventory, regionId: "other" })[0]?.availability).toBe("UNKNOWN");
  });
  it("does not silently align an inventory with fewer cells", () => {
    expect(assessDependency(one(), manifest, { ...inventory, cells: inventory.cells.slice(1) })[0]?.availability).toBe("UNKNOWN");
  });
  it("requires the same declared source name", () => {
    const changed = { ...inventory, cells: inventory.cells.map((c) => c.id === "entrance" ? { ...c, provenance: { ...c.provenance, source: "Unknown" } } : c) };
    expect(assessDependency(one(), manifest, changed)[0]?.cells[0]?.reason).toBe("source-conflict");
  });
  it("requires the same declared licence", () => {
    const changed = { ...inventory, cells: inventory.cells.map((c) => c.id === "entrance" ? { ...c, provenance: { ...c.provenance, licence: "Other" } } : c) };
    expect(assessDependency(one(), manifest, changed)[0]?.cells[0]?.reason).toBe("source-conflict");
  });
  it("requires the same source date", () => {
    const changed = { ...inventory, cells: inventory.cells.map((c) => c.id === "entrance" ? { ...c, provenance: { ...c.provenance, date: "2026-01-02" } } : c) };
    expect(assessDependency(one(), manifest, changed)[0]?.cells[0]?.reason).toBe("source-conflict");
  });
  it("requires the same expected byte size", () => {
    const changed = { ...inventory, cells: inventory.cells.map((c) => c.id === "entrance" ? { ...c, expectedBytes: 9999 } : c) };
    expect(assessDependency(one(), manifest, changed)[0]?.cells[0]?.reason).toBe("source-conflict");
  });
  it("does not equate a missing copy with saved", () => {
    const changed = { ...inventory, cells: inventory.cells.map((c) => c.id === "entrance" ? { ...c, state: "unknown" as const, cause: "missing" as const } : c) };
    expect(assessDependency(one(), manifest, changed)[0]?.availability).toBe("UNKNOWN");
  });
  it("does not equate a stale copy with saved", () => {
    const changed = { ...inventory, cells: inventory.cells.map((c) => c.id === "entrance" ? { ...c, state: "unknown" as const, cause: "stale" as const } : c) };
    expect(assessDependency(one(), manifest, changed)[0]?.availability).toBe("UNKNOWN");
  });
  it("reports an unlisted cell as UNKNOWN", () => {
    const book = addDependency(base(), { ...rawItem, cellIds: ["not-there"] }, "2026-02-03");
    const row = assessDependency(book, manifest, inventory)[0];
    expect(row?.cells[0]?.reason).toBe("not-listed");
    expect(row?.cells[0]?.source).toBeNull();
  });
  it("keeps source name, licence and date on the cell record", () => {
    const row = assessDependency(one(), manifest, inventory)[0];
    expect(row?.cells[0]?.source).toEqual(provenance);
  });
  it("requires every cell for an entirely saved information state", () => {
    const book = addDependency(base(), { ...rawItem, cellIds: ["entrance", "not-there"] }, "2026-02-03");
    const row = assessDependency(book, manifest, inventory)[0];
    expect(row?.savedCount).toBe(1);
    expect(row?.missingCount).toBe(1);
    expect(row?.availability).toBe("UNKNOWN");
  });
  it("flags unknown essential information for follow-up", () => {
    const row = assessDependency(one(), manifest, null)[0];
    expect(row?.followUp).toBe(true);
  });
  it("does not force a follow-up on unknown optional information", () => {
    const book = addDependency(base(), { ...rawItem, priority: "optional" }, "2026-02-03");
    expect(assessDependency(book, manifest, null)[0]?.followUp).toBe(false);
  });
  it("respects a manually requested follow-up", () => {
    const book = editDependency(one(), "question-1", { progress: "follow-up" }, "2026-02-04");
    expect(assessDependency(book, manifest, inventory)[0]?.followUp).toBe(true);
  });
  it("does not invent saved status for an empty book", () => {
    const stats = summarizeDependencies([]);
    expect(stats.dataStatus).toBe("UNKNOWN");
    expect(stats.physicalAccess).toBe("UNKNOWN");
  });
  it("counts unknown essentials separately from unknown optional items", () => {
    const book = addDependency(one(), { ...rawItem, id: "optional", priority: "optional", cellIds: ["not-there"] }, "2026-02-04");
    const summary = summarizeDependencies(assessDependency(book, manifest, null));
    expect(summary.essentials).toBe(1);
    expect(summary.essentialUnknown).toBe(1);
    expect(summary.unknownInformation).toBe(2);
  });
  it("does not mutate an inventory when assessing", () => {
    const before = JSON.stringify(inventory);
    assessDependency(two(), manifest, inventory);
    expect(JSON.stringify(inventory)).toBe(before);
  });
  it("does not mutate the saved book when assessing", () => {
    const book = two();
    const before = JSON.stringify(book);
    assessDependency(book, manifest, inventory);
    expect(JSON.stringify(book)).toBe(before);
  });
});

describe("offline dependency planner: filtering and paging", () => {
  const mixed = (): DependencyBook => {
    let book = base();
    for (const [i, priority] of ["optional", "essential", "useful", "essential"] .entries()) {
      book = addDependency(book, { ...rawItem, id: `item-${i}`, title: `Checkpoint ${i}`,
        priority: priority as DependencyPriority, cellIds: i % 2 ? ["not-there"] : ["entrance"] }, "2026-02-03");
    }
    return book;
  };
  const rows = () => assessDependency(mixed(), manifest, inventory);
  const query = (filter: "all" | "essential" | "UNKNOWN" | "saved" | "follow-up", sort: "added" | "priority" | "name" | "availability" = "added", offset = 0, limit = 50) =>
    pageDependencies(rows(), { filter, sort, query: "", offset, limit });
  it("keeps list order by default", () => {
    expect(query("all").rows.map((r) => r.itemId)).toEqual(["item-0", "item-1", "item-2", "item-3"]);
  });
  it("sorts essentials first", () => {
    expect(query("all", "priority").rows.slice(0, 2).map((r) => r.priority)).toEqual(["essential", "essential"]);
  });
  it("supports name sorting", () => {
    expect(query("all", "name").rows.map((r) => r.title)).toEqual(["Checkpoint 0", "Checkpoint 1", "Checkpoint 2", "Checkpoint 3"]);
  });
  it("sorts UNKNOWN before saved information", () => {
    expect(query("all", "availability").rows.slice(0, 2).every((r) => r.availability === "UNKNOWN")).toBe(true);
  });
  it("filters essential checkpoints", () => expect(query("essential").total).toBe(2));
  it("filters missing information", () => expect(query("UNKNOWN").total).toBe(2));
  it("filters saved information", () => expect(query("saved").total).toBe(2));
  it("filters important follow-up", () => expect(query("follow-up").total).toBe(2));
  it("has no previous page at offset 0", () => expect(query("all", "added", 0, 2).previous).toBe(false));
  it("has a next page when required", () => expect(query("all", "added", 0, 2).next).toBe(true));
  it("has a previous page after advancing", () => expect(query("all", "added", 2, 2).previous).toBe(true));
  it("has no next page at the end", () => expect(query("all", "added", 2, 2).next).toBe(false));
  it("does not change source row order while sorting", () => {
    const original = rows();
    pageDependencies(original, { filter: "all", sort: "priority", query: "", offset: 0, limit: 10 });
    expect(original.map((r) => r.itemId)).toEqual(["item-0", "item-1", "item-2", "item-3"]);
  });
  it("supports a case-insensitive search", () => {
    expect(pageDependencies(rows(), { filter: "all", sort: "added", query: "CHECKPOINT 2", offset: 0, limit: 10 }).total).toBe(1);
  });
  for (const offset of [-1, 1.5, Number.NaN]) it(`rejects invalid offset ${offset}`, () => {
    expect(() => pageDependencies(rows(), { filter: "all", sort: "added", query: "", offset, limit: 10 })).toThrow();
  });
  for (const limit of [0, 51, 2.1, Number.NaN]) it(`rejects invalid page limit ${limit}`, () => {
    expect(() => pageDependencies(rows(), { filter: "all", sort: "added", query: "", offset: 0, limit })).toThrow();
  });
  it("rejects a search longer than 160 characters", () => {
    expect(() => pageDependencies(rows(), { filter: "all", sort: "added", query: "x".repeat(161), offset: 0, limit: 10 })).toThrow();
  });
});
