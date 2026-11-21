import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";
import { addDependency, assessDependency, createDependencyBook, editDependency, pageDependencies,
  parseDependencyBook, serializeDependencyBook, summarizeDependencies, type DependencyBook } from "./dependencyPlanner";
import { dependencyReportJson, dependencyReportText } from "./dependencyPlannerExport";

const sourceA = { source: "Example source A", licence: "OGL", date: "2026-01-01" };
const sourceB = { source: "Example source B", licence: "CC BY 4.0", date: "2026-02-02" };
const manifest: RegionManifest = { regionId: "sample-ontario", cells: [
  { id: "arrival", bytes: 101, provenance: sourceA },
  { id: "entrance", bytes: 202, provenance: sourceA },
  { id: "transfer", bytes: 303, provenance: sourceB },
  { id: "washroom", bytes: 404, provenance: sourceB },
] };
const inventory: RegionInventory = {
  regionId: "sample-ontario", cells: manifest.cells.map((cell) => ({ id: cell.id,
    expectedBytes: cell.bytes, provenance: cell.provenance, cause: "present" as const,
    state: "saved" as const })), savedCount: 4, unknownCount: 0, savedBytes: 1010, expectedBytes: 1010, complete: true,
};
function book(): DependencyBook {
  let out = createDependencyBook("sample-ontario", "Local journey", "2026-03-01");
  const examples = [
    { id: "arrival-note", title: "Arrival", priority: "essential" as const, cellIds: ["arrival"] },
    { id: "entrance-note", title: "Entrance", priority: "essential" as const, cellIds: ["entrance"] },
    { id: "transfer-note", title: "Transfer", priority: "useful" as const, cellIds: ["transfer"] },
    { id: "washroom-note", title: "Washroom", priority: "optional" as const, cellIds: ["washroom"] },
  ];
  for (const entry of examples) {
    out = addDependency(out, { ...entry, category: "other", purpose: "Review source information",
      progress: "not-reviewed", note: "", }, "2026-03-01");
  }
  return out;
}
function modifiedInventory(id: string, changes: Partial<RegionInventory["cells"][number]>): RegionInventory {
  return { ...inventory, cells: inventory.cells.map((cell) => cell.id === id ? { ...cell, ...changes } : cell) };
}

describe("offline dependency scenarios: source status matrix", () => {
  it("reports four saved information dependencies when all metadata match", () => {
    const assessed = assessDependency(book(), manifest, inventory);
    expect(assessed.map((entry) => entry.availability)).toEqual(["saved", "saved", "saved", "saved"]);
    expect(summarizeDependencies(assessed).savedInformation).toBe(4);
  });
  it("makes no physical accessibility conclusion in a fully saved matrix", () => {
    const assessed = assessDependency(book(), manifest, inventory);
    expect(assessed.every((entry) => entry.physicalAccess === "UNKNOWN")).toBe(true);
    expect(summarizeDependencies(assessed).physicalAccess).toBe("UNKNOWN");
  });
  it("keeps a source-licence mismatch isolated to its own dependency", () => {
    const changed = modifiedInventory("transfer", { provenance: { ...sourceB, licence: "Other licence" } });
    const assessed = assessDependency(book(), manifest, changed);
    expect(assessed.map((entry) => entry.availability)).toEqual(["saved", "saved", "UNKNOWN", "saved"]);
    expect(assessed[2]?.cells[0]?.reason).toBe("source-conflict");
  });
  it("keeps a source-name mismatch isolated to its own dependency", () => {
    const changed = modifiedInventory("arrival", { provenance: { ...sourceA, source: "Different publisher" } });
    const assessed = assessDependency(book(), manifest, changed);
    expect(assessed.map((entry) => entry.availability)).toEqual(["UNKNOWN", "saved", "saved", "saved"]);
  });
  it("keeps a listed byte mismatch isolated to its own dependency", () => {
    const changed = modifiedInventory("entrance", { expectedBytes: 1 });
    const assessed = assessDependency(book(), manifest, changed);
    expect(assessed.map((entry) => entry.availability)).toEqual(["saved", "UNKNOWN", "saved", "saved"]);
  });
  it("does not accept an inventory that lists the same cell twice", () => {
    const changed = { ...inventory, cells: [inventory.cells[0]!, inventory.cells[0]!, inventory.cells[2]!, inventory.cells[3]!] };
    expect(assessDependency(book(), manifest, changed).every((entry) => entry.availability === "UNKNOWN")).toBe(true);
  });
  it("does not accept an inventory with more cells than the manifest", () => {
    const changed = { ...inventory, cells: [...inventory.cells, { ...inventory.cells[0]!, id: "extra" }] };
    expect(assessDependency(book(), manifest, changed).every((entry) => entry.availability === "UNKNOWN")).toBe(true);
  });
  it("does not accept an inventory from a different region", () => {
    const changed = { ...inventory, regionId: "another-ontario-area" };
    expect(assessDependency(book(), manifest, changed).every((entry) => entry.availability === "UNKNOWN")).toBe(true);
  });
  it("rejects data from a manifest from a different region", () => {
    const changed = { ...manifest, regionId: "another-ontario-area" };
    expect(assessDependency(book(), changed, inventory).every((entry) => entry.availability === "UNKNOWN")).toBe(true);
  });
  it("fails closed when listed source names are absent", () => {
    const changed = { ...manifest, cells: manifest.cells.map((cell) => cell.id === "arrival" ? { ...cell, provenance: { ...cell.provenance, source: "" } } : cell) };
    expect(assessDependency(book(), changed, inventory)[0]?.cells[0]?.reason).toBe("source-invalid");
  });
  it("fails closed when the listed licence is blank", () => {
    const changed = { ...manifest, cells: manifest.cells.map((cell) => cell.id === "arrival" ? { ...cell, provenance: { ...cell.provenance, licence: "" } } : cell) };
    expect(assessDependency(book(), changed, inventory)[0]?.cells[0]?.reason).toBe("source-invalid");
  });
  it("fails closed when the listed date is impossible", () => {
    const changed = { ...manifest, cells: manifest.cells.map((cell) => cell.id === "arrival" ? { ...cell, provenance: { ...cell.provenance, date: "2026-02-30" } } : cell) };
    expect(assessDependency(book(), changed, inventory)[0]?.cells[0]?.reason).toBe("source-invalid");
  });
  it("fails closed when the listed bytes are negative", () => {
    const changed = { ...manifest, cells: manifest.cells.map((cell) => cell.id === "arrival" ? { ...cell, bytes: -5 } : cell) };
    expect(assessDependency(book(), changed, inventory)[0]?.cells[0]?.reason).toBe("source-invalid");
  });
  it("preserves the exact published date when an inventory is unavailable", () => {
    const assessed = assessDependency(book(), manifest, null);
    expect(assessed[2]?.cells[0]?.source?.date).toBe("2026-02-02");
    expect(assessed[0]?.cells[0]?.source?.date).toBe("2026-01-01");
  });
  it("preserves licence metadata for an unknown local copy", () => {
    const assessed = assessDependency(book(), manifest, null);
    expect(assessed[0]?.cells[0]?.source?.licence).toBe("OGL");
    expect(assessed[2]?.cells[0]?.source?.licence).toBe("CC BY 4.0");
  });
  it("distinguishes stale source data from an unlisted cell", () => {
    const changed = modifiedInventory("entrance", { state: "unknown", cause: "stale" });
    const assessed = assessDependency(book(), manifest, changed);
    expect(assessed[1]?.cells[0]?.reason).toBe("stale");
    expect(assessed[1]?.cells[0]?.expectedBytes).toBe(202);
  });
  it("marks a saved flag with non-present cause as UNKNOWN", () => {
    const changed = modifiedInventory("entrance", { state: "saved", cause: "missing" });
    expect(assessDependency(book(), manifest, changed)[1]?.availability).toBe("UNKNOWN");
  });
  it("handles unreadable inventory without mutating it", () => {
    const changed = modifiedInventory("entrance", { state: "unknown", cause: "unreadable" });
    const before = JSON.stringify(changed);
    expect(assessDependency(book(), manifest, changed)[1]?.cells[0]?.reason).toBe("unreadable");
    expect(JSON.stringify(changed)).toBe(before);
  });
});

describe("offline dependency scenarios: user-controlled planning", () => {
  it("leaves an essential missing dependency in follow-up", () => {
    const changed = modifiedInventory("arrival", { state: "unknown", cause: "missing" });
    const summary = summarizeDependencies(assessDependency(book(), manifest, changed));
    expect(summary.essentialUnknown).toBe(1);
    expect(summary.requireFollowUp).toBe(1);
  });
  it("does not convert optional unknown data into an essential need", () => {
    const changed = modifiedInventory("washroom", { state: "unknown", cause: "missing" });
    const summary = summarizeDependencies(assessDependency(book(), manifest, changed));
    expect(summary.essentialUnknown).toBe(0);
    expect(summary.requireFollowUp).toBe(0);
  });
  it("lets the user mark optional information for follow-up", () => {
    const changed = editDependency(book(), "washroom-note", { progress: "follow-up" }, "2026-03-02");
    expect(summarizeDependencies(assessDependency(changed, manifest, inventory)).requireFollowUp).toBe(1);
  });
  it("keeps an asked question separate from confirmed physical access", () => {
    const changed = editDependency(book(), "arrival-note", { progress: "asked" }, "2026-03-02");
    const result = assessDependency(changed, manifest, inventory)[0];
    expect(result?.progress).toBe("asked");
    expect(result?.physicalAccess).toBe("UNKNOWN");
  });
  it("keeps a manually noted response separate from physical facts", () => {
    const changed = editDependency(book(), "arrival-note", { progress: "response-recorded", note: "Caller reported a different entrance" }, "2026-03-02");
    const result = assessDependency(changed, manifest, inventory)[0];
    expect(result?.progress).toBe("response-recorded");
    expect(result?.physicalAccess).toBe("UNKNOWN");
  });
  it("never inserts source metadata into a personal note", () => {
    const changed = editDependency(book(), "entrance-note", { note: "My own observation" }, "2026-03-02");
    const record = changed.items[1];
    expect(record?.note).toBe("My own observation");
    expect(record?.note).not.toContain(sourceA.source);
  });
  it("supports stable paging after importing an exported plan", () => {
    const restored = parseDependencyBook(serializeDependencyBook(book()), "sample-ontario");
    const rows = assessDependency(restored, manifest, inventory);
    const first = pageDependencies(rows, { filter: "all", sort: "added", query: "", offset: 0, limit: 2 });
    const second = pageDependencies(rows, { filter: "all", sort: "added", query: "", offset: 2, limit: 2 });
    expect([...first.rows, ...second.rows].map((row) => row.itemId)).toEqual(["arrival-note", "entrance-note", "transfer-note", "washroom-note"]);
  });
  it("exports the exact two source names when data is incomplete", () => {
    const rows = assessDependency(book(), manifest, null);
    const output = dependencyReportText(book(), rows, summarizeDependencies(rows), "en");
    expect(output).toContain(sourceA.source);
    expect(output).toContain(sourceB.source);
    expect(output).toContain("UNKNOWN");
  });
  it("keeps the physical-access flag unknown in exported JSON", () => {
    const rows = assessDependency(book(), manifest, inventory);
    const exported = dependencyReportJson(book(), rows, summarizeDependencies(rows));
    const parsed = JSON.parse(exported) as { physicalAccess: string; assessments: Array<{ physicalAccess: string }> };
    expect(parsed.physicalAccess).toBe("UNKNOWN");
    expect(parsed.assessments.every((entry) => entry.physicalAccess === "UNKNOWN")).toBe(true);
  });
  it("never mutates the manifest while generating an export", () => {
    const before = JSON.stringify(manifest);
    const rows = assessDependency(book(), manifest, inventory);
    dependencyReportJson(book(), rows, summarizeDependencies(rows));
    expect(JSON.stringify(manifest)).toBe(before);
  });
  it("retains a distinct record for every information checkpoint", () => {
    const original = book();
    const rows = assessDependency(original, manifest, inventory);
    expect(rows.map((row) => row.itemId)).toEqual(original.items.map((item) => item.id));
  });
});
