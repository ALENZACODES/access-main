import { describe, expect, it } from "vitest";
import {
  cleanupReceiptCopy, cleanupReceiptFilename, cleanupReceiptText,
  createCleanupReceipt,
} from "./cleanupReceipt";
import { type CleanupOutcome } from "./cleanupController";
import { type RegionManifest } from "./regionDownload";
import { type RegionInventory } from "./regionInventory";

const source = { source: "Ontario Open Data", licence: "CC BY 4.0", date: "2026-02-01" };
const manifest: RegionManifest = {
  regionId: "region-west",
  cells: [
    { id: "first", bytes: 100, provenance: source },
    { id: "second", bytes: 250, provenance: source },
    { id: "third", bytes: 25, provenance: source },
  ],
};
const inventory: RegionInventory = {
  regionId: "region-west",
  cells: [
    { id: "first", state: "unknown", cause: "missing", expectedBytes: 100, provenance: source },
    { id: "second", state: "saved", cause: "present", expectedBytes: 250, provenance: source },
    { id: "third", state: "saved", cause: "present", expectedBytes: 25, provenance: source },
  ],
  savedCount: 2, unknownCount: 1, savedBytes: 275,
  expectedBytes: 375, complete: false,
};
const outcome: CleanupOutcome = {
  regionId: "region-west", deleted: ["first"], retained: ["second"],
  stop: "interrupted", latestInventory: inventory,
};

describe("offline cleanup report", () => {
  it("records only explicitly named cells", () => {
    const report = createCleanupReceipt(manifest, outcome, "2026-11-15");
    expect(report.items.map((item) => item.id)).toEqual(["first", "second"]);
    expect(report.items.some((item) => item.id === "third")).toBe(false);
  });
  it("keeps UNKNOWN after a removed copy", () => {
    const report = createCleanupReceipt(manifest, outcome, "2026-11-15");
    expect(report.items[0]).toMatchObject({
      action: "removed", offlineStateAfter: "UNKNOWN", listedBytes: 100,
    });
  });
  it("keeps saved and removed states distinct", () => {
    const report = createCleanupReceipt(manifest, outcome, "2026-11-15");
    expect(report.items[1]).toMatchObject({ action: "retained", offlineStateAfter: "SAVED" });
  });
  it("stores source licence and source date on every row", () => {
    const report = createCleanupReceipt(manifest, outcome, "2026-11-15");
    expect(report.items.every((item) => item.source === source.source &&
      item.licence === source.licence && item.sourceDate === source.date)).toBe(true);
  });
  it("records the reason for incomplete cleanup", () => {
    expect(createCleanupReceipt(manifest, outcome, "2026-11-15").stop).toBe("interrupted");
  });
  it("declares its local inventory evidence scope", () => {
    expect(createCleanupReceipt(manifest, outcome, "2026-11-15").evidence)
      .toBe("device-local-inventory");
  });
  it("rejects an invalid date", () => {
    expect(() => createCleanupReceipt(manifest, outcome, "2026-02-30")).toThrow(RangeError);
  });
  it("rejects a region mismatch", () => {
    expect(() => createCleanupReceipt(manifest, { ...outcome, regionId: "east" }, "2026-11-15"))
      .toThrow("region mismatch");
  });
  it("requires a readable post-action inventory", () => {
    expect(() => createCleanupReceipt(manifest, { ...outcome, latestInventory: null }, "2026-11-15"))
      .toThrow("unavailable");
  });
  it("rejects a post-action inventory from another region", () => {
    expect(() => createCleanupReceipt(manifest, {
      ...outcome, latestInventory: { ...inventory, regionId: "east" },
    }, "2026-11-15")).toThrow("unavailable");
  });
  it("rejects unlisted result cells", () => {
    expect(() => createCleanupReceipt(manifest, {
      ...outcome, deleted: ["not-listed"], retained: [],
    }, "2026-11-15")).toThrow("Unlisted");
  });
  it("rejects duplicated result identifiers", () => {
    expect(() => createCleanupReceipt(manifest, {
      ...outcome, deleted: ["first"], retained: ["first"],
    }, "2026-11-15")).toThrow("Duplicate");
  });
  it("rejects duplicated manifest identifiers", () => {
    expect(() => createCleanupReceipt({
      ...manifest, cells: [...manifest.cells, manifest.cells[0]!],
    }, outcome, "2026-11-15")).toThrow("Duplicate");
  });
  it("rejects source mismatches in a new inventory", () => {
    const changed = { ...inventory, cells: inventory.cells.map((cell) =>
      cell.id === "first" ? { ...cell, provenance: { ...source, date: "2025-01-01" } } : cell) };
    expect(() => createCleanupReceipt(manifest, {
      ...outcome, latestInventory: changed,
    }, "2026-11-15")).toThrow("differs");
  });
  it("rejects changed byte sizes", () => {
    const changed = { ...inventory, cells: inventory.cells.map((cell) =>
      cell.id === "first" ? { ...cell, expectedBytes: 99 } : cell) };
    expect(() => createCleanupReceipt(manifest, {
      ...outcome, latestInventory: changed,
    }, "2026-11-15")).toThrow("differs");
  });
  it("exports English text with source data", () => {
    const text = cleanupReceiptText(createCleanupReceipt(manifest, outcome, "2026-11-15"), "en");
    expect(text).toContain("Offline copy removal record");
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("2026-02-01");
  });
  it("exports French text with source data", () => {
    const text = cleanupReceiptText(createCleanupReceipt(manifest, outcome, "2026-11-15"), "fr");
    expect(text).toContain("Compte rendu");
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("INCONNU");
  });
  it("uses French nonbreaking space before colons in text", () => {
    const text = cleanupReceiptText(createCleanupReceipt(manifest, outcome, "2026-11-15"), "fr");
    expect(/(?<!\u00a0):/u.test(text)).toBe(false);
  });
  it("sanitises separators in exported text fields", () => {
    const odd: RegionManifest = { ...manifest, cells: [
      { ...manifest.cells[0]!, provenance: { ...source, source: "Ontario\trow\nbreak" } },
      ...manifest.cells.slice(1),
    ] };
    const latest: RegionInventory = { ...inventory, cells: inventory.cells.map((cell) =>
      cell.id === "first" ? { ...cell, provenance: odd.cells[0]!.provenance } : cell) };
    const text = cleanupReceiptText(createCleanupReceipt(odd, {
      ...outcome, latestInventory: latest,
    }, "2026-11-15"), "en");
    expect(text).toContain("Ontario row break");
    expect(text).not.toContain("Ontario\trow\nbreak");
  });
  it("uses a filename without path separators", () => {
    const receipt = createCleanupReceipt(manifest, outcome, "2026-11-15");
    expect(cleanupReceiptFilename({ ...receipt, regionId: "a/../b" }, "txt"))
      .toBe("offline-cleanup-a----b-2026-11-15.txt");
  });
  it("offers both English and French save labels", () => {
    expect(cleanupReceiptCopy("en").button.length).toBeGreaterThan(0);
    expect(cleanupReceiptCopy("fr").button.length).toBeGreaterThan(0);
  });
});
