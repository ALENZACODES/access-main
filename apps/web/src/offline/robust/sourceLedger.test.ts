import { describe, expect, it } from "vitest";
import type { RegionManifest, Provenance } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import {
  browseSourceLedger, buildSourceLedger, encodeSourceLedger,
  type SourceTierRecord,
} from "./sourceLedger";

const source: Provenance = {
  source: "Ontario open information",
  licence: "CC BY 4.0",
  date: "2026-01-15",
};
const another: Provenance = {
  source: "Municipal open information",
  licence: "CC0 1.0",
  date: "2026-02-02",
};
const manifest: RegionManifest = {
  regionId: "demo",
  cells: [
    { id: "a", bytes: 10, provenance: source },
    { id: "b", bytes: 20, provenance: source },
    { id: "c", bytes: 30, provenance: another },
  ],
};
function cell(id: string, cause: InventoryCell["cause"]): InventoryCell {
  const target = manifest.cells.find((entry) => entry.id === id);
  if (!target) throw new Error("Missing test fixture cell");
  return {
    id,
    state: cause === "present" ? "saved" : "unknown",
    cause,
    expectedBytes: target.bytes,
    provenance: target.provenance,
  };
}
function inventory(cells: readonly InventoryCell[]): RegionInventory {
  const matching = cells.filter((item) => item.state === "saved");
  return {
    regionId: manifest.regionId,
    cells,
    savedCount: matching.length,
    unknownCount: cells.length - matching.length,
    savedBytes: matching.reduce((sum, item) => sum + item.expectedBytes, 0),
    expectedBytes: manifest.cells.reduce((sum, item) => sum + item.bytes, 0),
    complete: matching.length === manifest.cells.length,
  };
}
function tier(id: string, sourceRecord: Provenance = source): SourceTierRecord {
  return {
    cellId: id,
    ...sourceRecord,
    tier: "documented",
    basis: "Source record published on the stated date",
  };
}
function example() {
  return buildSourceLedger(manifest, inventory([
    cell("a", "present"), cell("b", "missing"), cell("c", "stale"),
  ]));
}

describe("offline source ledger", () => {
  it("distinguishes saved bytes and UNKNOWN metadata", () => {
    const result = example();
    expect(result.state).toBe("partial");
    expect(result.saved).toBe(1);
    expect(result.unknown).toBe(2);
    expect(result.tierUnknown).toBe(3);
    expect(result.rows.map((row) => row.state)).toEqual(["saved", "UNKNOWN", "UNKNOWN"]);
    expect(result.rows.map((row) => row.reason)).toEqual(["present", "missing", "stale"]);
    expect(result.listedBytes).toBe(60);
    expect(result.savedBytes).toBe(10);
  });

  it("does not infer tier from local availability", () => {
    const result = buildSourceLedger(manifest, inventory(manifest.cells.map((entry) => cell(entry.id, "present"))));
    expect(result.state).toBe("complete");
    expect(result.tierUnknown).toBe(3);
    expect(result.rows.every((row) => row.tier === "UNKNOWN")).toBe(true);
  });

  it("accepts an explicitly documented tier with a matching source", () => {
    const result = buildSourceLedger(manifest, inventory([cell("a", "present")]), [tier("a")]);
    expect(result.rows[0]).toMatchObject({ tier: "documented", state: "saved" });
    expect(result.tierUnknown).toBe(2);
  });

  it("never changes storage state from supplied tier", () => {
    const result = buildSourceLedger(manifest, inventory([cell("b", "missing")]), [tier("b")]);
    expect(result.rows[1]).toMatchObject({ tier: "documented", state: "UNKNOWN" });
  });

  it("rejects tier claims for different source names", () => {
    const result = buildSourceLedger(manifest, inventory([cell("a", "present")]), [tier("a", another)]);
    expect(result.rows[0]?.tier).toBe("UNKNOWN");
  });

  it("rejects tier claims for different dates", () => {
    const result = buildSourceLedger(manifest, inventory([cell("a", "present")]), [
      tier("a", { ...source, date: "2025-01-15" }),
    ]);
    expect(result.rows[0]?.tier).toBe("UNKNOWN");
  });

  it("rejects tier claims missing an explanatory basis", () => {
    const result = buildSourceLedger(manifest, inventory([cell("a", "present")]), [
      { ...tier("a"), basis: " " },
    ]);
    expect(result.rows[0]?.tier).toBe("UNKNOWN");
  });

  it("rejects duplicate tier claims even when identical", () => {
    const result = buildSourceLedger(manifest, inventory([cell("a", "present")]), [tier("a"), tier("a")]);
    expect(result.rows[0]?.state).toBe("UNKNOWN");
    expect(result.rows[0]?.tier).toBe("UNKNOWN");
    expect(result.issues).toContain("duplicate-tier-record");
  });

  it("shows UNKNOWN with an unreadable inventory", () => {
    const result = buildSourceLedger(manifest, null);
    expect(result.state).toBe("UNKNOWN");
    expect(result.saved).toBe(0);
    expect(result.unknown).toBe(3);
    expect(result.savedBytes).toBeNull();
  });

  it("rejects a different region inventory", () => {
    const result = buildSourceLedger(manifest, { ...inventory([]), regionId: "other" });
    expect(result.issues).toContain("region-mismatch");
    expect(result.rows.every((row) => row.state === "UNKNOWN")).toBe(true);
  });

  it("rejects duplicated manifest cells", () => {
    const repeated = { ...manifest, cells: [manifest.cells[0], manifest.cells[0]] } as RegionManifest;
    const result = buildSourceLedger(repeated, inventory([cell("a", "present")]));
    expect(result.state).toBe("UNKNOWN");
    expect(result.rows.every((row) => row.reason === "duplicate")).toBe(true);
  });

  it("rejects duplicated inventory entries", () => {
    const result = buildSourceLedger(manifest, inventory([cell("a", "present"), cell("a", "present")]));
    expect(result.rows[0]?.reason).toBe("duplicate");
    expect(result.issues).toContain("duplicate-observation");
  });

  it("rejects unsupported source licences", () => {
    const result = buildSourceLedger({
      ...manifest,
      cells: [{ id: "a", bytes: 10, provenance: { ...source, licence: "Restricted" } }],
    }, inventory([]));
    expect(result.rows[0]).toMatchObject({ state: "UNKNOWN", tier: "UNKNOWN", reason: "invalid-source" });
  });

  it("rejects impossible dates", () => {
    const result = buildSourceLedger({
      ...manifest,
      cells: [{ id: "a", bytes: 10, provenance: { ...source, date: "2026-02-30" } }],
    }, inventory([]));
    expect(result.rows[0]?.reason).toBe("invalid-source");
  });

  it("rejects negative and unsafe byte sizes", () => {
    for (const bytes of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const result = buildSourceLedger({
        ...manifest, cells: [{ id: "a", bytes, provenance: source }],
      }, inventory([]));
      expect(result.listedBytes).toBeNull();
    }
  });

  it("marks mismatched observed source UNKNOWN", () => {
    const wrong = { ...cell("a", "present"), provenance: another };
    const result = buildSourceLedger(manifest, inventory([wrong]));
    expect(result.rows[0]?.reason).toBe("metadata-conflict");
    expect(result.rows[0]?.state).toBe("UNKNOWN");
  });

  it("marks mismatched observed size UNKNOWN", () => {
    const wrong = { ...cell("a", "present"), expectedBytes: 99 };
    const result = buildSourceLedger(manifest, inventory([wrong]));
    expect(result.rows[0]?.reason).toBe("metadata-conflict");
  });

  it("includes unlisted local cells without treating them as listed", () => {
    const wrong = { ...cell("a", "present"), id: "outside" };
    const result = buildSourceLedger(manifest, inventory([wrong]));
    expect(result.state).toBe("UNKNOWN");
    expect(result.rows.at(-1)).toMatchObject({ id: "outside", state: "UNKNOWN", reason: "unlisted" });
  });

  it("searches IDs and sources without changing the ledger", () => {
    const ledger = example();
    const page = browseSourceLedger(ledger, {
      filter: "all", order: "listed", search: "  MUNICIPAL ", offset: 0, limit: 12,
    });
    expect(page.rows.map((row) => row.id)).toEqual(["c"]);
    expect(ledger.rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("filters UNKNOWN tiers without inferring accessibility", () => {
    const ledger = buildSourceLedger(manifest, inventory([cell("a", "present")]), [tier("a")]);
    const page = browseSourceLedger(ledger, {
      filter: "tier-unknown", order: "listed", search: "", offset: 0, limit: 12,
    });
    expect(page.rows.map((row) => row.id)).toEqual(["b", "c"]);
  });

  it("filters only source conflicts", () => {
    const ledger = buildSourceLedger(manifest, inventory([{ ...cell("a", "present"), provenance: another }]));
    const page = browseSourceLedger(ledger, {
      filter: "source-issue", order: "listed", search: "", offset: 0, limit: 12,
    });
    expect(page.rows.map((row) => row.id)).toEqual(["a"]);
  });

  it("caps page size and retains deterministic order", () => {
    const ledger = example();
    const page = browseSourceLedger(ledger, {
      filter: "all", order: "size", search: "", offset: -5, limit: 200,
    });
    expect(page.limit).toBe(100);
    expect(page.offset).toBe(0);
    expect(page.rows.map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("paginates without losing rows", () => {
    const ledger = example();
    const ids: string[] = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const page = browseSourceLedger(ledger, {
        filter: "all", order: "listed", search: "", offset, limit: 1,
      });
      expect(page.rows).toHaveLength(1);
      const row = page.rows[0];
      if (!row) throw new Error("Fixture page is empty");
      ids.push(row.id);
      expect(page.hasNext).toBe(offset < 2);
    }
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("serializes source/licence/date/tier and no cell payloads", () => {
    const exported = encodeSourceLedger(example());
    expect(JSON.parse(exported)).toMatchObject({
      schema: "offline-source-ledger-v1", saved: 1, unknown: 2,
    });
    expect(exported).toContain("CC BY 4.0");
    expect(exported).toContain("2026-01-15");
    expect(exported).toContain("UNKNOWN");
    expect(exported).not.toContain("Uint8Array");
    expect(exported).not.toContain("base64");
  });
});
