import { describe, expect, it } from "vitest";
import { type RegionManifest } from "./regionDownload";
import { type RegionInventory } from "./regionInventory";
import {
  buildTransferChecklist, compareTransferChecklist, encodeTransferChecklist,
  filteredChecklistRows, parseTransferChecklist, transferChecklistFilename,
  type ChecklistEntry, type TransferChecklist,
} from "./transferChecklist";

const original = { source: "Municipal open data", licence: "CC BY 4.0", date: "2026-03-01" };
const changed = { ...original, date: "2026-05-01" };
const manifest: RegionManifest = {
  regionId: "central", cells: [
    { id: "alpha", bytes: 10, provenance: original },
    { id: "beta", bytes: 20, provenance: original },
    { id: "gamma", bytes: 30, provenance: changed },
  ],
};
const day = "2026-11-19";
function inventory(saved: readonly string[]): RegionInventory {
  return {
    regionId: "central", savedCount: saved.length,
    unknownCount: manifest.cells.length - saved.length,
    savedBytes: manifest.cells.filter((cell) => saved.includes(cell.id))
      .reduce((sum, cell) => sum + cell.bytes, 0),
    expectedBytes: 60, complete: saved.length === manifest.cells.length,
    cells: manifest.cells.map((cell) => ({
      id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
      state: saved.includes(cell.id) ? "saved" as const : "unknown" as const,
      cause: saved.includes(cell.id) ? "present" as const : "missing" as const,
    })),
  };
}
function fixture(): TransferChecklist {
  return buildTransferChecklist(manifest, inventory(["alpha", "gamma"]), day);
}
function substitute(entry: ChecklistEntry, change: Partial<ChecklistEntry>): ChecklistEntry {
  return { ...entry, ...change };
}

describe("device-local transfer checklist", () => {
  it("stores only metadata, not payload bytes", () => {
    const result = fixture();
    const json = encodeTransferChecklist(result);
    expect(json).toContain('"schema": "offline-transfer-checklist-v1"');
    expect(json).toContain("Municipal open data");
    expect(json).not.toContain("Uint8Array");
    expect(json).not.toContain("base64");
    expect(json).not.toContain("data:application");
  });
  it("contains source, licence, date and explicit UNKNOWN tier", () => {
    const entry = fixture().entries[0];
    expect(entry).toMatchObject({
      id: "alpha", source: original.source, licence: original.licence,
      date: original.date, tier: "UNKNOWN", previousStatus: "saved",
    });
  });
  it("never infers a tier from the licence", () => {
    expect(fixture().entries.every((entry) => entry.tier === "UNKNOWN")).toBe(true);
  });
  it("does not assert saved status without a local scan", () => {
    expect(buildTransferChecklist(manifest, null, day).entries
      .every((entry) => entry.previousStatus === "UNKNOWN")).toBe(true);
  });
  it("does not trust inventory from another region", () => {
    const wrong: RegionInventory = { ...inventory(["alpha"]), regionId: "elsewhere" };
    expect(buildTransferChecklist(manifest, wrong, day).entries
      .every((entry) => entry.previousStatus === "UNKNOWN")).toBe(true);
  });
  it("does not trust partially scanned inventory", () => {
    const incomplete: RegionInventory = {
      ...inventory(["alpha"]), cells: inventory(["alpha"]).cells.slice(0, 1),
    };
    expect(buildTransferChecklist(manifest, incomplete, day).entries
      .every((entry) => entry.previousStatus === "UNKNOWN")).toBe(true);
  });
  it("does not trust duplicate local observations", () => {
    const repeated: RegionInventory = {
      ...inventory(["alpha"]), cells: [
        inventory(["alpha"]).cells[0]!, inventory(["alpha"]).cells[0]!, inventory(["alpha"]).cells[2]!,
      ],
    };
    expect(buildTransferChecklist(manifest, repeated, day).entries
      .every((entry) => entry.previousStatus === "UNKNOWN")).toBe(true);
  });
  it("does not trust changed source, licence, date or size", () => {
    for (const cell of [
      { provenance: { ...original, source: "New source" } },
      { provenance: { ...original, licence: "CC0 1.0" } },
      { provenance: { ...original, date: "2026-04-01" } },
      { expectedBytes: 9 },
    ]) {
      const base = inventory(["alpha"]);
      const altered: RegionInventory = {
        ...base, cells: base.cells.map((entry) => entry.id === "alpha" ? { ...entry, ...cell } : entry),
      };
      expect(buildTransferChecklist(manifest, altered, day).entries[0]?.previousStatus).toBe("UNKNOWN");
    }
  });
  it("treats a present observation marked unknown as UNKNOWN", () => {
    const base = inventory(["alpha"]);
    const altered: RegionInventory = { ...base,
      cells: base.cells.map((cell) => cell.id === "alpha" ? { ...cell, state: "unknown" as const } : cell),
    };
    expect(buildTransferChecklist(manifest, altered, day).entries[0]?.previousStatus).toBe("UNKNOWN");
  });
  it("round-trips its exact schema", () => {
    const source = fixture();
    expect(parseTransferChecklist(encodeTransferChecklist(source))).toEqual(source);
  });
  it("rejects malformed JSON", () => {
    expect(() => parseTransferChecklist("not json")).toThrow();
  });
  it("rejects unknown root properties", () => {
    const invalid = { ...fixture(), privateInfo: "never" };
    expect(() => parseTransferChecklist(JSON.stringify(invalid))).toThrow();
  });
  it("rejects unknown cell properties", () => {
    const base = fixture();
    const invalid = { ...base, entries: [{ ...base.entries[0], rawBytes: [1, 2, 3] }] };
    expect(() => parseTransferChecklist(JSON.stringify(invalid))).toThrow();
  });
  it("rejects duplicate identifiers", () => {
    const base = fixture();
    expect(() => parseTransferChecklist(JSON.stringify({ ...base, entries: [base.entries[0], base.entries[0]] }))).toThrow();
  });
  it("rejects invalid dates and non-calendar dates", () => {
    for (const date of ["2026-02-30", "2026-13-01", "2026-1-1", ""])
      expect(() => buildTransferChecklist(manifest, null, date)).toThrow();
  });
  it("accepts leap day", () => {
    expect(buildTransferChecklist(manifest, null, "2024-02-29").createdOn).toBe("2024-02-29");
  });
  it("rejects oversized imported metadata", () => {
    expect(() => parseTransferChecklist(" ".repeat(260_000))).toThrow();
  });
  it("rejects control and directional characters in cell metadata", () => {
    for (const source of ["bad\nsource", "bad\u202esource"]) {
      const invalid = { ...manifest, cells: [{ ...manifest.cells[0]!, provenance: { ...original, source } }] };
      expect(() => buildTransferChecklist(invalid, null, day)).toThrow();
    }
  });
  it("rejects unsafe identifier and negative bytes", () => {
    for (const item of [{ id: "../escape" }, { bytes: -1 }, { bytes: Number.POSITIVE_INFINITY }]) {
      const invalid = { ...manifest, cells: [{ ...manifest.cells[0]!, ...item }] };
      expect(() => buildTransferChecklist(invalid, null, day)).toThrow();
    }
  });
  it("rejects duplicate manifest identifiers", () => {
    expect(() => buildTransferChecklist({ ...manifest,
      cells: [manifest.cells[0]!, manifest.cells[0]!],
    }, null, day)).toThrow();
  });
  it("keeps historical saved status separate from current status", () => {
    const comparison = compareTransferChecklist(fixture(), manifest, inventory([]), day);
    expect(comparison.rows[0]).toMatchObject({ currentStatus: "UNKNOWN", kind: "UNKNOWN" });
    expect(comparison.unknown).toBe(3);
  });
  it("handles source date changes explicitly", () => {
    const before = fixture();
    const later: RegionManifest = { ...manifest, cells: manifest.cells.map((cell) =>
      cell.id === "alpha" ? { ...cell, provenance: changed } : cell) };
    const compared = compareTransferChecklist(before, later, inventory(["alpha"]), day);
    expect(compared.rows[0]?.kind).toBe("changed");
    expect(compared.rows[0]?.currentStatus).toBe("UNKNOWN");
  });
  it("identifies newly listed cells", () => {
    const shorter = { ...manifest, cells: manifest.cells.slice(0, 1) };
    const before = buildTransferChecklist(shorter, null, day);
    expect(compareTransferChecklist(before, manifest, inventory([]), day).rows[1]?.kind).toBe("new");
  });
  it("identifies removed cells", () => {
    const shorter = { ...manifest, cells: manifest.cells.slice(0, 1) };
    const compared = compareTransferChecklist(fixture(), shorter, null, day);
    expect(compared.rows.find((cell) => cell.id === "gamma")?.kind).toBe("removed");
  });
  it("marks region mismatch UNKNOWN", () => {
    const compared = compareTransferChecklist({ ...fixture(), regionId: "outside" }, manifest, null, day);
    expect(compared.notes).toContain("region-mismatch");
    expect(compared.rows.every((cell) => cell.kind === "UNKNOWN")).toBe(true);
  });
  it("filters differences", () => {
    const compared = compareTransferChecklist(fixture(), manifest, inventory([]), day);
    expect(filteredChecklistRows(compared, "changed", "", 0).total).toBe(3);
  });
  it("filters UNKNOWN independently from previous records", () => {
    const compared = compareTransferChecklist(fixture(), manifest, inventory([]), day);
    expect(filteredChecklistRows(compared, "UNKNOWN", "", 0).total).toBe(3);
  });
  it("searches source, licence, and cell identifiers", () => {
    const compared = compareTransferChecklist(fixture(), manifest, inventory([]), day);
    expect(filteredChecklistRows(compared, "all", "GAMMA", 0).rows[0]?.id).toBe("gamma");
    expect(filteredChecklistRows(compared, "all", "municipal", 0).total).toBe(3);
    expect(filteredChecklistRows(compared, "all", "CC BY", 0).total).toBe(3);
  });
  it("paginates with bounded page size", () => {
    const compared = compareTransferChecklist(fixture(), manifest, inventory([]), day);
    expect(filteredChecklistRows(compared, "all", "", 0, 1).pages).toBe(3);
    expect(filteredChecklistRows(compared, "all", "", 1, 1).rows[0]?.id).toBe("beta");
  });
  it("makes safe deterministic filenames", () => {
    expect(transferChecklistFilename("../unsafe", day)).toBe("offline-checklist----unsafe-2026-11-19.json");
  });
  it("does not silently accept a forged tier", () => {
    const base = fixture();
    expect(() => parseTransferChecklist(JSON.stringify({ ...base,
      entries: [substitute(base.entries[0]!, { tier: "superior" as never })],
    }))).toThrow();
  });
});
