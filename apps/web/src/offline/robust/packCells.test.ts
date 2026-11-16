import { describe, expect, it } from "vitest";
import type { PackManifest } from "../../../../../packages/data-client/src/index.ts";
import {
  cellStatusText,
  cellSummaryText,
  createMemoryLedger,
  createPackCellStore,
  downloadRegion,
  downloadResultText,
  regionCellReport,
  regionManifestFor,
} from "./index.ts";

function pack(builtAt: string, hash: string): PackManifest {
  const part = (cell: string, bytes: number) => ({ path: `${cell}.gz`, bytes, sha256: `${hash}-${cell}`, count: 1, sourceId: "osm" });
  return {
    version: 1, builtAt, sourceCommit: "test",
    sources: [
      { sourceId: "osm", name: "OpenStreetMap", licence: "ODbL-1.0", retrieved: "2026-11-01", inWebPack: true },
      { sourceId: "held", name: "Held source", licence: "Unknown", retrieved: "2026-11-01", inWebPack: false },
    ],
    regions: [{ id: "toronto", label: { en: "Toronto", fr: "Toronto" }, bbox: [-80, 43, -79, 44], cells: ["a", "b", "c"] }],
    tranches: { venue: { cells: {
      a: { bbox: [-80, 43, -79, 44], parts: [part("a", 10)] },
      b: { bbox: [-80, 43, -79, 44], parts: [part("b", 20)] },
    } } },
    search: { c: { path: "c.json.gz", bytes: 5, sha256: `${hash}-search-c`, count: 1 } },
    tiles: {}, counts: { records: 2, byTranche: {}, bySource: {} },
  };
}

describe("pack cells wired to the robust rules", () => {
  it("builds one cell per pack cell with source, licence, build date and bytes", () => {
    const manifest = regionManifestFor(pack("2026-11-15T10:00:00Z", "v2"), "toronto");
    expect(manifest.cells).toEqual([
      { id: "a", bytes: 10, provenance: { source: "OpenStreetMap", licence: "ODbL-1.0", date: "2026-11-15" } },
      { id: "b", bytes: 20, provenance: { source: "OpenStreetMap", licence: "ODbL-1.0", date: "2026-11-15" } },
      { id: "c", bytes: 5, provenance: { source: "OpenStreetMap", licence: "ODbL-1.0", date: "2026-11-15" } },
    ]);
    expect(() => regionManifestFor(pack("2026-11-15T10:00:00Z", "v2"), "nowhere")).toThrow();
  });

  it("labels a copy from an older build stale, not UNKNOWN, and an absent cell missing", async () => {
    const ledger = createMemoryLedger();
    const older = regionManifestFor(pack("2026-10-01T10:00:00Z", "v1"), "toronto");
    // The older build was downloaded for cells a and b.
    const first = createPackCellStore({ manifest: older, ledger, missingCells: new Set(["a", "b", "c"]) });
    await downloadRegion({ ...older, cells: older.cells.slice(0, 2) }, {
      store: first,
      estimateStorage: async () => ({ quota: 1e9, usage: 0 }),
      fetchCell: async (_regionId, cell) => cell.bytes,
    });
    const current = regionManifestFor(pack("2026-11-15T10:00:00Z", "v2"), "toronto");
    // The new build's parts are not stored yet; only cell a has been fetched again.
    const store = createPackCellStore({ manifest: current, ledger, missingCells: new Set(["b", "c"]) });
    const report = await regionCellReport(current, store);
    expect(report.map((cell) => cell.lookup.status)).toEqual(["available", "stale", "missing"]);
    const stale = report[1]!.lookup;
    expect(cellStatusText("en", stale)).toBe(
      "Out of date. Saved copy from 2026-10-01; current data is from 2026-11-15. Download it again to use it offline.",
    );
    expect(cellStatusText("fr", stale)).toContain("Périmée. Copie enregistrée le 2026-10-01");
    expect(cellStatusText("en", report[2]!.lookup)).toBe("Not downloaded. Not available offline.");
    expect(cellSummaryText("en", report.map((cell) => cell.lookup.status))).toBe(
      "3 cells. Available offline: 1. Out of date: 1. Not downloaded: 1. UNKNOWN: 0.",
    );
    expect(cellSummaryText("fr", report.map((cell) => cell.lookup.status))).toBe(
      "3 cellules. Disponible hors ligne\u00a0: 1. Périmées\u00a0: 1. Non téléchargées\u00a0: 1. INCONNU\u00a0: 0.",
    );
  });

  it("treats a ledger row from the current build without its parts as missing", async () => {
    const ledger = createMemoryLedger();
    const current = regionManifestFor(pack("2026-11-15T10:00:00Z", "v2"), "toronto");
    await ledger.put("toronto/a", { bytes: 10, provenance: current.cells[0]!.provenance });
    const store = createPackCellStore({ manifest: current, ledger, missingCells: new Set(["a", "b", "c"]) });
    expect((await regionCellReport(current, store))[0]!.lookup.status).toBe("missing");
    await ledger.deleteRegion("toronto");
    expect(await ledger.get("toronto/a")).toBeUndefined();
  });

  it("reports a partial region with counts and the reason", async () => {
    const ledger = createMemoryLedger();
    const current = regionManifestFor(pack("2026-11-15T10:00:00Z", "v2"), "toronto");
    const store = createPackCellStore({ manifest: current, ledger, missingCells: new Set(["a", "b", "c"]) });
    const result = await downloadRegion(current, {
      store,
      estimateStorage: async () => ({ quota: 1e9, usage: 0 }),
      fetchCell: async (_regionId, cell) => { if (cell.id === "b") throw new Error("network"); return cell.bytes; },
    });
    expect(downloadResultText("en", result)).toBe(
      "Only part of this region is available offline. 1 of 3 cells available offline, 2 not downloaded. Download stopped. Saved cells remain available.",
    );
    expect(downloadResultText("fr", result)).toContain("1 cellule sur 3 disponible hors ligne, 2 non téléchargées.");
  });
});
