import { describe, expect, it } from "vitest";
import type { RegionManifest, Provenance } from "./regionDownload";
import type { RegionInventory, InventoryCell } from "./regionInventory";
import {
  createDiagnosticExport, diagnosticFilename, encodeDiagnosticExport,
  inspectOfflineDiagnostics, queryOfflineDiagnostics,
  type DiagnosticFilter, type DiagnosticOrder,
} from "./offlineDiagnostics";

const source: Provenance = { source: "Public geographic dataset", licence: "CC BY 4.0", date: "2026-01-15" };
const other: Provenance = { source: "Municipal open records", licence: "CC0 1.0", date: "2026-02-03" };
const manifest: RegionManifest = { regionId: "central", cells: [
  { id: "alpha", bytes: 10, provenance: source },
  { id: "beta", bytes: 20, provenance: source },
  { id: "gamma", bytes: 30, provenance: other },
  { id: "delta", bytes: 40, provenance: other },
] };

function row(id: string, cause: InventoryCell["cause"], overrides: Partial<InventoryCell> = {}): InventoryCell {
  const listed = manifest.cells.find((cell) => cell.id === id);
  if (!listed) throw new Error("Invalid fixture ID");
  return { id, cause, state: cause === "present" ? "saved" : "unknown",
    expectedBytes: listed.bytes, provenance: listed.provenance, ...overrides };
}

function inventory(cells: readonly InventoryCell[]): RegionInventory {
  const saved = cells.filter((cell) => cell.state === "saved");
  return { regionId: "central", cells,
    savedCount: saved.length, unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((n, cell) => n + cell.expectedBytes, 0),
    expectedBytes: cells.reduce((n, cell) => n + cell.expectedBytes, 0),
    complete: saved.length === cells.length };
}

const example = () => inspectOfflineDiagnostics(manifest, inventory([
  row("alpha", "present"), row("beta", "missing"),
  row("gamma", "stale"), row("delta", "unreadable"),
]));

const query = (filter: DiagnosticFilter = "all", order: DiagnosticOrder = "listed", search = "") =>
  queryOfflineDiagnostics(example(), { filter, order, search, offset: 0, limit: 12 });

describe("offline diagnostic evidence", () => {
  it("labels a matching recorded copy as saved", () => {
    const result = example();
    expect(result.cells[0]).toMatchObject({ id: "alpha", status: "saved", reason: "saved", action: "none" });
  });

  it("never treats a missing copy as saved", () => {
    expect(example().cells[1]).toMatchObject({ status: "UNKNOWN", reason: "missing", action: "download" });
  });

  it("keeps stale copies UNKNOWN", () => {
    expect(example().cells[2]).toMatchObject({ status: "UNKNOWN", reason: "stale", action: "download" });
  });

  it("keeps unreadable copies UNKNOWN without recommending a blind download", () => {
    expect(example().cells[3]).toMatchObject({ status: "UNKNOWN", reason: "unreadable", action: "inspect" });
  });

  it("counts all four causes", () => {
    expect(example()).toMatchObject({ saved: 1, unknown: 3, missing: 1, stale: 1, unreadable: 1 });
  });

  it("uses explicit UNKNOWN for documentation tiers", () => {
    expect(example().cells.every((cell) => cell.tier === "UNKNOWN")).toBe(true);
  });

  it("keeps a null inventory UNKNOWN", () => {
    const report = inspectOfflineDiagnostics(manifest, null);
    expect(report.status).toBe("UNKNOWN");
    expect(report.saved).toBe(0);
    expect(report.unknown).toBe(4);
    expect(report.savedBytes).toBeNull();
  });

  it("rejects a different region's inventory", () => {
    const report = inspectOfflineDiagnostics(manifest, { ...inventory([]), regionId: "other" });
    expect(report.status).toBe("UNKNOWN");
    expect(report.diagnostics).toContain("region-mismatch");
  });

  it("does not equate missing observations with missing downloads", () => {
    const report = inspectOfflineDiagnostics(manifest, inventory([row("alpha", "present")]));
    expect(report.cells[1]?.reason).toBe("not-inspected");
    expect(report.status).toBe("UNKNOWN");
  });

  it("recognizes a fully matching manifest", () => {
    const report = inspectOfflineDiagnostics(manifest, inventory(manifest.cells.map((cell) => row(cell.id, "present"))));
    expect(report.status).toBe("complete");
    expect(report.savedBytes).toBe(100);
    expect(report.unknown).toBe(0);
  });

  it("reports a documented partial download", () => {
    const report = inspectOfflineDiagnostics(manifest, inventory([
      row("alpha", "present"), row("beta", "missing"),
      row("gamma", "present"), row("delta", "present"),
    ]));
    expect(report.status).toBe("partial");
    expect(report.savedBytes).toBe(80);
  });

  it("fails closed on contradictory metadata", () => {
    const report = inspectOfflineDiagnostics(manifest, inventory([
      row("alpha", "present", { provenance: other }),
    ]));
    expect(report.cells[0]).toMatchObject({ status: "UNKNOWN", reason: "metadata-conflict" });
  });

  it("fails closed on a mismatched expected byte count", () => {
    const report = inspectOfflineDiagnostics(manifest, inventory([
      row("alpha", "present", { expectedBytes: 19 }),
    ]));
    expect(report.cells[0]?.status).toBe("UNKNOWN");
  });

  it("does not count duplicate local identifiers as saved", () => {
    const report = inspectOfflineDiagnostics(manifest, inventory([row("alpha", "present"), row("alpha", "present")]));
    expect(report.cells[0]?.status).toBe("UNKNOWN");
    expect(report.diagnostics).toContain("duplicate-observation:alpha");
  });

  it("rejects duplicate listing identifiers", () => {
    const report = inspectOfflineDiagnostics({ ...manifest, cells: [manifest.cells[0], manifest.cells[0]] as RegionManifest["cells"] }, inventory([]));
    expect(report.status).toBe("UNKNOWN");
    expect(report.savedBytes).toBeNull();
  });

  it("rejects a source with an unsupported licence", () => {
    const report = inspectOfflineDiagnostics({ ...manifest, cells: [{ id: "bad", bytes: 1,
      provenance: { ...source, licence: "Proprietary" } }] }, inventory([]));
    expect(report.cells[0]).toMatchObject({ status: "UNKNOWN", reason: "invalid-listing" });
  });

  it("rejects impossible dates", () => {
    const report = inspectOfflineDiagnostics({ ...manifest, cells: [{ id: "bad", bytes: 1,
      provenance: { ...source, date: "2026-02-30" } }] }, inventory([]));
    expect(report.status).toBe("UNKNOWN");
  });

  it("reports unlisted observed cells as UNKNOWN", () => {
    const report = inspectOfflineDiagnostics(manifest, inventory([
      row("alpha", "present"), { ...row("beta", "present"), id: "outside" },
    ]));
    expect(report.unlisted).toBe(1);
    expect(report.cells.at(-1)).toMatchObject({ id: "outside", status: "UNKNOWN", reason: "unlisted" });
  });

  it("keeps browser quota UNKNOWN without a valid estimate", () => {
    expect(inspectOfflineDiagnostics(manifest, inventory([])).freeBytes).toBeNull();
    expect(inspectOfflineDiagnostics(manifest, inventory([]), { quota: 1, usage: 2 }).freeBytes).toBeNull();
    expect(inspectOfflineDiagnostics(manifest, inventory([]), { quota: Number.NaN, usage: 0 }).freeBytes).toBeNull();
  });

  it("reports only estimated remaining bytes", () => {
    expect(inspectOfflineDiagnostics(manifest, inventory([]), { quota: 200, usage: 50 }).freeBytes).toBe(150);
  });

  it("does not claim a storage tier from provenance alone", () => {
    const report = inspectOfflineDiagnostics(manifest, inventory([row("alpha", "present")]));
    expect(report.cells[0]?.tier).toBe("UNKNOWN");
  });

  it("filters saved and UNKNOWN states independently", () => {
    expect(query("saved").cells.map((cell) => cell.id)).toEqual(["alpha"]);
    expect(query("unknown").cells.map((cell) => cell.id)).toEqual(["beta", "gamma", "delta"]);
  });

  it("filters explicit download suggestions", () => {
    expect(query("download").cells.map((cell) => cell.id)).toEqual(["beta", "gamma"]);
  });

  it("filters inspection recommendations", () => {
    expect(query("inspect").cells.map((cell) => cell.id)).toEqual(["delta"]);
  });

  it("searches IDs, dates and source information", () => {
    expect(query("all", "listed", "  GAMMA ").cells.map((cell) => cell.id)).toEqual(["gamma"]);
    expect(query("all", "listed", "Municipal").total).toBe(2);
    expect(query("all", "listed", "CC BY").total).toBe(2);
  });

  it("sorts cells by size without mutating the summary", () => {
    const report = example();
    const before = report.cells.map((cell) => cell.id);
    const descending = queryOfflineDiagnostics(report, { filter: "all", search: "", order: "bytes-desc", offset: 0, limit: 12 });
    expect(descending.cells.map((cell) => cell.id)).toEqual(["delta", "gamma", "beta", "alpha"]);
    expect(report.cells.map((cell) => cell.id)).toEqual(before);
  });

  it("caps page sizes", () => {
    expect(queryOfflineDiagnostics(example(), { filter: "all", order: "listed", search: "", offset: -1, limit: 999 }).limit).toBe(50);
  });

  it("paginates while preserving all records", () => {
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const page = queryOfflineDiagnostics(example(), { filter: "all", order: "listed", search: "", offset: i, limit: 1 });
      expect(page.cells).toHaveLength(1);
      const item = page.cells[0];
      if (!item) throw new Error("Missing test cell");
      seen.push(item.id);
      expect(page.previous).toBe(i > 0);
      expect(page.next).toBe(i < 3);
    }
    expect(seen).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("does not export downloaded data", () => {
    const text = encodeDiagnosticExport(createDiagnosticExport(example(), "2026-11-19"));
    expect(text).not.toContain("Uint8Array");
    expect(text).not.toContain("data:application");
    expect(text).toContain("CC BY 4.0");
    expect(JSON.parse(text)).toMatchObject({ schema: "offline-diagnostics-v1", status: "UNKNOWN" });
  });

  it("rejects malformed export dates", () => {
    expect(() => createDiagnosticExport(example(), "2026-02-30")).toThrow();
  });

  it("keeps file names bounded and path-safe", () => {
    expect(diagnosticFilename("../Other/REGION", "2026-11-19")).toBe("offline-diagnostics-other-region-2026-11-19.json");
    expect(110).toBeGreaterThan(diagnosticFilename("A".repeat(1000), "2026-11-19").length);
  });
});
