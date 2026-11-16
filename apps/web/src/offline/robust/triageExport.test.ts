import { describe, expect, it, vi } from "vitest";
import { type RegionInventory } from "./regionInventory";
import { createTriageRecoveryList, formatTriageRecoveryList, saveTriageRecoveryList } from "./triageExport";

const provenance = { source: "Open Ontario source", licence: "CC BY 4.0", date: "2025-10-12" };
const inventory: RegionInventory = {
  regionId: "north-zone",
  cells: [
    { id: "alpha", state: "unknown", cause: "missing", expectedBytes: 10, provenance },
    { id: "beta", state: "saved", cause: "present", expectedBytes: 20, provenance },
    { id: "gamma", state: "unknown", cause: "stale", expectedBytes: 30, provenance },
    { id: "delta", state: "unknown", cause: "unreadable", expectedBytes: 40, provenance },
  ],
  savedCount: 1, unknownCount: 3, savedBytes: 20, expectedBytes: 100, complete: false,
};

describe("recovery-list export", () => {
  it("includes only requested UNKNOWN cells", () => {
    const list = createTriageRecoveryList(inventory, ["alpha", "beta"], "2026-11-15");
    expect(list.rows.map((row) => row.id)).toEqual(["alpha"]);
    expect(list.rowCount).toBe(1);
  });

  it("ignores unlisted and repeated identifiers", () => {
    const list = createTriageRecoveryList(inventory, ["alpha", "other", "alpha"], "2026-11-15");
    expect(list.rowCount).toBe(1);
  });

  it("orders rows by the manifest inventory", () => {
    const list = createTriageRecoveryList(inventory, ["delta", "alpha", "gamma"], "2026-11-15");
    expect(list.rows.map((row) => row.id)).toEqual(["alpha", "gamma", "delta"]);
  });

  it("preserves source, open licence and publication date", () => {
    const list = createTriageRecoveryList(inventory, ["alpha"], "2026-11-15");
    expect(list.rows[0]).toMatchObject({ source: provenance.source, licence: provenance.licence, date: provenance.date });
  });

  it("records expected byte counts without leaking payload data", () => {
    const list = createTriageRecoveryList(inventory, ["gamma"], "2026-11-15");
    expect(list.rows[0]?.expectedBytes).toBe(30);
    expect(JSON.stringify(list)).not.toContain("dataUrl");
    expect(JSON.stringify(list)).not.toContain("ArrayBuffer");
  });

  it("never converts absent copy status into place accessibility", () => {
    const list = createTriageRecoveryList(inventory, ["alpha"], "2026-11-15");
    expect(list.rows[0]?.status).toBe("UNKNOWN");
    expect(list.note).toContain("does not establish physical accessibility");
  });

  it("distinguishes stale, missing and unreadable causes", () => {
    const list = createTriageRecoveryList(inventory, ["alpha", "gamma", "delta"], "2026-11-15");
    expect(list.rows.map((row) => row.reason)).toEqual(["missing", "stale", "unreadable"]);
  });

  it("returns an empty report when nothing was selected", () => {
    const list = createTriageRecoveryList(inventory, [], "2026-11-15");
    expect(list.rows).toEqual([]);
    expect(list.rowCount).toBe(0);
  });

  it("rejects an empty region identifier", () => {
    expect(() => createTriageRecoveryList({ ...inventory, regionId: "" }, ["alpha"], "2026-11-15")).toThrow(TypeError);
  });

  it("rejects malformed generated dates", () => {
    expect(() => createTriageRecoveryList(inventory, ["alpha"], "yesterday")).toThrow(RangeError);
  });

  it("rejects nonexistent generated dates", () => {
    expect(() => createTriageRecoveryList(inventory, ["alpha"], "2026-02-30")).toThrow(RangeError);
  });

  it("rejects missing source metadata on exported rows", () => {
    const altered: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "alpha" ?
        { ...cell, provenance: { ...cell.provenance, source: "" } } : cell),
    };
    expect(() => createTriageRecoveryList(altered, ["alpha"], "2026-11-15")).toThrow(TypeError);
  });

  it("rejects missing licence on exported rows", () => {
    const altered: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "alpha" ?
        { ...cell, provenance: { ...cell.provenance, licence: "" } } : cell),
    };
    expect(() => createTriageRecoveryList(altered, ["alpha"], "2026-11-15")).toThrow(TypeError);
  });

  it("rejects invalid source dates on exported rows", () => {
    const altered: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "alpha" ?
        { ...cell, provenance: { ...cell.provenance, date: "2026-02-30" } } : cell),
    };
    expect(() => createTriageRecoveryList(altered, ["alpha"], "2026-11-15")).toThrow(TypeError);
  });

  it("rejects unsafe expected byte counts", () => {
    const altered: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "alpha" ?
        { ...cell, expectedBytes: Number.POSITIVE_INFINITY } : cell),
    };
    expect(() => createTriageRecoveryList(altered, ["alpha"], "2026-11-15")).toThrow(RangeError);
  });

  it("formats English with clear metadata labels", () => {
    const list = createTriageRecoveryList(inventory, ["alpha"], "2026-11-15");
    const text = formatTriageRecoveryList(list, "en");
    expect(text).toContain("Offline recovery list");
    expect(text).toContain("Licence: CC BY 4.0");
    expect(text).toContain("Offline status: UNKNOWN");
  });

  it("formats French with nonbreaking punctuation", () => {
    const list = createTriageRecoveryList(inventory, ["alpha"], "2026-11-15");
    const text = formatTriageRecoveryList(list, "fr");
    expect(text).toContain("Licence\u00a0: CC BY 4.0");
    expect(text).toContain("État hors ligne\u00a0: INCONNU");
    expect(text).not.toContain("'");
  });

  it("ends text reports with a newline", () => {
    const list = createTriageRecoveryList(inventory, [], "2026-11-15");
    expect(formatTriageRecoveryList(list, "en").endsWith("\n")).toBe(true);
  });

  it("does not include an automatic download URL", () => {
    const list = createTriageRecoveryList(inventory, ["alpha"], "2026-11-15");
    const text = formatTriageRecoveryList(list, "en");
    expect(text).not.toContain("http://");
    expect(text).not.toContain("https://");
  });

  it("creates a first-party local file only on an explicit call", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const append = vi.fn();
    const link = { href: "", download: "", style: { display: "" }, click, remove };
    const doc = {
      createElement: vi.fn(() => link),
      body: { append },
    } as unknown as Document;
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    try {
      const list = createTriageRecoveryList(inventory, ["alpha"], "2026-11-15");
      saveTriageRecoveryList(list, "en", doc);
      expect(link.download).toBe("offline-recovery-north-zone-2026-11-15-en.txt");
      expect(click).toHaveBeenCalledTimes(1);
      expect(append).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(revoke).toHaveBeenCalledWith("blob:local");
    } finally {
      create.mockRestore();
      revoke.mockRestore();
    }
  });
});
