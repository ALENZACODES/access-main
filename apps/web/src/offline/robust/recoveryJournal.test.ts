import { describe, expect, it } from "vitest";
import type { DownloadResult, Provenance, RegionManifest } from "./regionDownload";
import type { InventoryCell, RegionInventory } from "./regionInventory";
import {
  JOURNAL_LIMITS, appendRecoveryJournal, captureJournalEntry, clearRecoveryJournal,
  compareJournalEntries, emptyRecoveryJournal, formatJournalByteCount,
  journalActionForCell, latestJournalComparison, pageJournalChanges,
  recoveryJournalTotals, safeTimestamp, validJournalProvenance,
  type JournalCell, type JournalComparison, type JournalEntry,
  type JournalEvent, type RecoveryJournal,
} from "./recoveryJournal";

const source: Provenance = {
  source: "Public municipal dataset", licence: "CC BY 4.0", date: "2026-08-12",
};
const alternate: Provenance = {
  source: "Public provincial dataset", licence: "CC0 1.0", date: "2026-10-02",
};
const manifest: RegionManifest = {
  regionId: "downtown",
  cells: [
    { id: "cell-01", bytes: 10, provenance: source },
    { id: "cell-02", bytes: 20, provenance: source },
    { id: "cell-03", bytes: 30, provenance: alternate },
    { id: "cell-04", bytes: 40, provenance: alternate },
  ],
};
const baseTime = "2026-11-19T10:00:00Z";
const nextTime = "2026-11-19T11:00:00Z";
function cell(id: string, cause: InventoryCell["cause"]): InventoryCell {
  const listed = manifest.cells.find((item) => item.id === id);
  if (!listed) throw new RangeError("Unknown test cell");
  return { id, state: cause === "present" ? "saved" : "unknown",
    cause, expectedBytes: listed.bytes, provenance: listed.provenance };
}
function inventory(rows: readonly InventoryCell[]): RegionInventory {
  const saved = rows.filter((row) => row.state === "saved");
  return { regionId: manifest.regionId, cells: rows, savedCount: saved.length,
    unknownCount: rows.length - saved.length,
    savedBytes: saved.reduce((sum, row) => sum + row.expectedBytes, 0),
    expectedBytes: rows.reduce((sum, row) => sum + row.expectedBytes, 0),
    complete: saved.length === rows.length };
}
function full(): RegionInventory {
  return inventory(manifest.cells.map((row) => cell(row.id, "present")));
}
function partial(): RegionInventory {
  return inventory([
    cell("cell-01", "present"), cell("cell-02", "missing"),
    cell("cell-03", "stale"), cell("cell-04", "missing"),
  ]);
}
function read(
  stored: RegionInventory | null = partial(),
  at = baseTime,
  event: JournalEvent = "snapshot",
  listed: RegionManifest = manifest,
): Omit<JournalEntry, "sequence"> {
  return captureJournalEntry(listed, stored, at, event);
}
function history(...entries: Omit<JournalEntry, "sequence">[]): RecoveryJournal {
  return entries.reduce((j, item) => appendRecoveryJournal(j, item), emptyRecoveryJournal(manifest.regionId));
}
function page(comparison: JournalComparison, overrides: Partial<Parameters<typeof pageJournalChanges>[1]> = {}) {
  return pageJournalChanges(comparison, {
    search: "", filter: "all", sort: "listed", page: 0, pageSize: 10, ...overrides,
  });
}

// A copied metadata record never asserts physical access at a place.
describe("recovery journal capture", () => {
  it("starts empty and UNKNOWN", () => {
    const j = emptyRecoveryJournal(manifest.regionId);
    expect(j.schema).toBe("offline-recovery-journal-v1");
    expect(j.entries).toEqual([]);
    expect(recoveryJournalTotals(j).health).toBe("UNKNOWN");
    expect(latestJournalComparison(j)).toBeNull();
  });

  it("refuses blank or path-shaped region identifiers", () => {
    for (const id of ["", " ", "../zone", "a/b", "a..b", "a?b", "z".repeat(200)]) {
      expect(() => emptyRecoveryJournal(id)).toThrow();
    }
  });

  it("captures matching saved copies with provenance", () => {
    const result = read(full());
    expect(result.health).toBe("complete");
    expect(result.cells).toHaveLength(4);
    expect(result.cells.every((item) => item.status === "saved")).toBe(true);
    expect(result.cells[0]?.provenance).toEqual(source);
    expect(result.cells[2]?.provenance).toEqual(alternate);
  });

  it("captures partial copies without calling missing ones saved", () => {
    const result = read();
    expect(result.health).toBe("partial");
    expect(result.cells.map((row) => row.status)).toEqual(["saved", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect(result.cells.map((row) => row.cause)).toEqual(["present", "missing", "stale", "missing"]);
  });

  it("keeps no-inventory reading UNKNOWN", () => {
    const result = read(null);
    expect(result.health).toBe("UNKNOWN");
    expect(result.warnings).toContain("inventory-unavailable");
    expect(result.cells.every((row) => row.status === "UNKNOWN")).toBe(true);
    expect(result.cells.every((row) => row.bytes === null)).toBe(true);
  });

  it("does not guess the status of cells excluded from a partial scan", () => {
    const result = read(inventory([cell("cell-01", "present")]));
    expect(result.cells[0]?.status).toBe("saved");
    expect(result.cells[1]?.cause).toBe("not-inspected");
    expect(result.cells[1]?.status).toBe("UNKNOWN");
    expect(result.health).toBe("UNKNOWN");
  });

  it("rejects inventory for another region", () => {
    const result = read({ ...full(), regionId: "suburb" });
    expect(result.warnings).toContain("region-mismatch");
    expect(result.cells.every((row) => row.status === "UNKNOWN")).toBe(true);
  });

  it("rejects an inventory with duplicate identifiers", () => {
    const result = read(inventory([cell("cell-01", "present"), cell("cell-01", "present")]));
    expect(result.warnings).toContain("duplicate-inventory-id");
    expect(result.health).toBe("UNKNOWN");
    expect(result.cells.every((row) => row.cause === "invalid-listing")).toBe(true);
  });

  it("rejects an inventory with unlisted identifiers", () => {
    const rows = [...full().cells, { ...cell("cell-01", "present"), id: "outside" }];
    const result = read(inventory(rows));
    expect(result.warnings).toContain("unlisted-inventory-cell");
    expect(result.cells.every((row) => row.status === "UNKNOWN")).toBe(true);
  });

  it("rejects a manifest containing duplicate identifiers", () => {
    const bad: RegionManifest = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] };
    const result = read(inventory([]), baseTime, "snapshot", bad);
    expect(result.warnings).toContain("duplicate-manifest-id");
    expect(result.health).toBe("UNKNOWN");
  });

  it("rejects invalid listed sizes", () => {
    const bad = { ...manifest, cells: [{ ...manifest.cells[0]!, bytes: -2 }] };
    const result = read(inventory([]), baseTime, "snapshot", bad);
    expect(result.warnings).toContain("invalid-listed-size");
    expect(result.health).toBe("UNKNOWN");
  });

  it("rejects unsupported source licences", () => {
    const bad = { ...manifest, cells: [{ ...manifest.cells[0]!, provenance: {
      ...source, licence: "Private use only",
    } }] };
    const result = read(inventory([]), baseTime, "snapshot", bad);
    expect(result.warnings).toContain("invalid-source");
    expect(result.cells[0]?.status).toBe("UNKNOWN");
  });

  it("flags source differences even when inventory claims saved", () => {
    const changed = inventory([
      { ...cell("cell-01", "present"), provenance: alternate },
      cell("cell-02", "missing"), cell("cell-03", "missing"), cell("cell-04", "missing"),
    ]);
    const result = read(changed);
    expect(result.cells[0]?.cause).toBe("metadata-conflict");
    expect(result.cells[0]?.status).toBe("UNKNOWN");
    expect(result.cells[0]?.provenance).toEqual(source);
  });

  it("flags byte-size differences despite saved status", () => {
    const changed = inventory([
      { ...cell("cell-01", "present"), expectedBytes: 11 },
      cell("cell-02", "missing"), cell("cell-03", "missing"), cell("cell-04", "missing"),
    ]);
    expect(read(changed).cells[0]?.cause).toBe("metadata-conflict");
  });

  it("never upgrades a stale cell because the metadata matches", () => {
    const result = read(inventory([
      cell("cell-01", "stale"), cell("cell-02", "missing"),
      cell("cell-03", "missing"), cell("cell-04", "missing"),
    ]));
    expect(result.cells[0]?.status).toBe("UNKNOWN");
    expect(result.cells[0]?.cause).toBe("stale");
  });

  it("does not upgrade inconsistent cause and saved flag", () => {
    const wrong = { ...cell("cell-01", "present"), state: "unknown" as const };
    const result = read(inventory([wrong]));
    expect(result.cells[0]?.status).toBe("UNKNOWN");
    expect(result.cells[0]?.cause).toBe("present");
  });

  it("uses explicit event types, not a background inference", () => {
    const events: JournalEvent[] = ["snapshot", "after-download", "before-cleanup", "manual-review"];
    for (const event of events) expect(read(partial(), baseTime, event).event).toBe(event);
  });

  it("rejects impossible or timezone-ambiguous timestamps", () => {
    for (const date of ["", "2026-02-30T10:00:00Z", "2026-11-19", "2026-11-19T10:00:00+00:00",
      "2026-11-19T24:00:00Z", "2026-11-19T10:00:00Z\nnew"] ) {
      expect(safeTimestamp(date)).toBe(false);
      expect(() => read(partial(), date)).toThrow();
    }
  });

  it("accepts exact UTC timestamps with fractional milliseconds", () => {
    expect(safeTimestamp("2026-11-19T10:10:10.125Z")).toBe(true);
    expect(read(partial(), "2026-11-19T10:10:10.125Z").capturedAt).toBe("2026-11-19T10:10:10.125Z");
  });

  it("does not copy a result from another region", () => {
    const result: DownloadResult = { regionId: "wrong", completed: true,
      available: [], missing: [], reason: "complete" };
    const reading = captureJournalEntry(manifest, partial(), baseTime, "after-download", result);
    expect(reading.downloadReason).toBeNull();
    expect(reading.warnings).toContain("download-region-mismatch");
    expect(reading.health).toBe("UNKNOWN");
  });

  it("records an interrupted result only as a stop reason", () => {
    const result: DownloadResult = { regionId: "downtown", completed: false,
      available: ["cell-01"], missing: ["cell-02", "cell-03", "cell-04"], reason: "interrupted" };
    const reading = captureJournalEntry(manifest, partial(), baseTime, "after-download", result);
    expect(reading.downloadReason).toBe("interrupted");
    expect(reading.cells[1]?.status).toBe("UNKNOWN");
  });
});

describe("journal source policy", () => {
  it("accepts only the established open-licence allowlist", () => {
    expect(validJournalProvenance(source)).toBe(true);
    expect(validJournalProvenance(alternate)).toBe(true);
    expect(validJournalProvenance({ ...source, licence: "Private" })).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    for (const date of ["2026-02-30", "2026-13-01", "2026-0-1", "2026-03-32"]) {
      expect(validJournalProvenance({ ...source, date })).toBe(false);
    }
  });

  it("rejects empty metadata", () => {
    expect(validJournalProvenance({ ...source, source: "" })).toBe(false);
    expect(validJournalProvenance({ ...source, licence: "" })).toBe(false);
  });

  it("rejects directional control marks in source names", () => {
    expect(validJournalProvenance({ ...source, source: "Public\u202eCounterfeit" })).toBe(false);
    expect(validJournalProvenance({ ...source, source: "Public\nInjected" })).toBe(false);
  });

  it("rejects excessively long source labels", () => {
    expect(validJournalProvenance({ ...source, source: "a".repeat(501) })).toBe(false);
  });
});

describe("bounded journal append and clear", () => {
  it("appends with monotonic sequence numbers", () => {
    const j = history(read(), read(full(), nextTime));
    expect(j.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(j.entries.at(-1)?.health).toBe("complete");
  });

  it("rejects snapshots from another region", () => {
    const previous = emptyRecoveryJournal("other");
    expect(() => appendRecoveryJournal(previous, read())).toThrow();
  });

  it("rejects out-of-order capture times", () => {
    const journal = history(read(full(), nextTime));
    expect(() => appendRecoveryJournal(journal, read(partial(), baseTime))).toThrow();
  });

  it("permits equal timestamps for two deliberate actions", () => {
    const j = history(read(), read(full()));
    expect(j.entries).toHaveLength(2);
  });

  it("does not mutate previous snapshots", () => {
    const first = read();
    const before = first.cells[0]?.provenance?.source;
    const journal = history(first);
    const second = appendRecoveryJournal(journal, read(full(), nextTime));
    expect(journal.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(2);
    expect(first.cells[0]?.provenance?.source).toBe(before);
  });

  it("rejects duplicate cell rows in an appended reading", () => {
    const reading = read();
    expect(() => appendRecoveryJournal(emptyRecoveryJournal(manifest.regionId), {
      ...reading, cells: [reading.cells[0]!, reading.cells[0]!],
    })).toThrow();
  });

  it("rejects an unsupported licence in appended metadata", () => {
    const reading = read();
    const changed: JournalCell = { ...reading.cells[0]!, provenance: {
      ...source, licence: "unrestricted?",
    } };
    expect(() => appendRecoveryJournal(emptyRecoveryJournal(manifest.regionId), {
      ...reading, cells: [changed],
    })).toThrow();
  });

  it("rejects a fake saved flag without source", () => {
    const reading = read();
    expect(() => appendRecoveryJournal(emptyRecoveryJournal(manifest.regionId), {
      ...reading, cells: [{ id: "x", status: "saved", cause: "present", bytes: 20, provenance: null }],
    })).toThrow();
  });

  it("rejects unsafe warning strings", () => {
    const reading = read();
    expect(() => appendRecoveryJournal(emptyRecoveryJournal(manifest.regionId), {
      ...reading, warnings: ["danger\nnew row"],
    })).toThrow();
  });

  it("limits the number of retained snapshots", () => {
    let j = emptyRecoveryJournal(manifest.regionId);
    for (let i = 0; i < JOURNAL_LIMITS.maxEntries + 5; i += 1) {
      const time = new Date(Date.UTC(2026, 10, 19, 10, i)).toISOString().replace(".000Z", "Z");
      j = appendRecoveryJournal(j, read(partial(), time));
    }
    expect(j.entries).toHaveLength(JOURNAL_LIMITS.maxEntries);
    expect(j.entries[0]?.sequence).toBe(6);
    expect(j.entries.at(-1)?.sequence).toBe(JOURNAL_LIMITS.maxEntries + 5);
  });

  it("clears all entries without changing region identity", () => {
    const j = clearRecoveryJournal(history(read()));
    expect(j.regionId).toBe("downtown");
    expect(j.entries).toEqual([]);
  });

  it("aggregates status counts from only the latest snapshot", () => {
    const j = history(read(), read(full(), nextTime));
    const totals = recoveryJournalTotals(j);
    expect(totals.snapshots).toBe(2);
    expect(totals.latestSaved).toBe(4);
    expect(totals.latestUnknown).toBe(0);
    expect(totals.lastCapture).toBe(nextTime);
  });

  it("does not hide unreadable and source-conflict counts", () => {
    const observations = inventory([
      cell("cell-01", "present"), cell("cell-02", "unreadable"),
      { ...cell("cell-03", "present"), provenance: source }, cell("cell-04", "stale"),
    ]);
    const totals = recoveryJournalTotals(history(read(observations)));
    expect(totals.unreadable).toBe(1);
    expect(totals.sourceConflicts).toBe(1);
    expect(totals.latestUnknown).toBe(3);
  });
});

describe("journal comparison", () => {
  it("marks the first reading as new, without a fabricated prior reading", () => {
    const j = history(read());
    const comparison = latestJournalComparison(j);
    expect(comparison?.fromSequence).toBeNull();
    expect(comparison?.rows.map((row) => row.kind)).toEqual(["new", "new", "new", "new"]);
  });

  it("detects newly saved copies", () => {
    const j = history(read(), read(full(), nextTime));
    const comparison = latestJournalComparison(j);
    expect(comparison?.newlySaved).toBe(3);
    expect(comparison?.newlyUnknown).toBe(0);
    expect(comparison?.unchanged).toBe(1);
  });

  it("detects an entry becoming UNKNOWN again", () => {
    const j = history(read(full()), read(partial(), nextTime));
    expect(latestJournalComparison(j)?.newlyUnknown).toBe(3);
  });

  it("does not mistake a changed source for a saved copy", () => {
    const before = history(read()).entries[0]!;
    const modified: JournalEntry = { ...before, sequence: 2,
      cells: before.cells.map((item) => item.id === "cell-01" ?
        { ...item, provenance: alternate } : item) };
    const comparison = compareJournalEntries(before, modified);
    expect(comparison.changedSource).toBe(1);
    expect(comparison.rows[0]?.kind).toBe("source-changed");
  });

  it("detects changed listed byte counts", () => {
    const before = history(read()).entries[0]!;
    const modified: JournalEntry = { ...before, sequence: 2,
      cells: before.cells.map((item) => item.id === "cell-02" ?
        { ...item, bytes: 999 } : item) };
    expect(compareJournalEntries(before, modified).changedSize).toBe(1);
  });

  it("detects reason changes that keep the same UNKNOWN state", () => {
    const before = history(read()).entries[0]!;
    const modified: JournalEntry = { ...before, sequence: 2,
      cells: before.cells.map((item) => item.id === "cell-02" ?
        { ...item, cause: "stale" as const } : item) };
    expect(compareJournalEntries(before, modified).rows[1]?.kind).toBe("cause-changed");
  });

  it("identifies removed identifiers without assuming they were deleted", () => {
    const before = history(read()).entries[0]!;
    const modified: JournalEntry = { ...before, sequence: 2, cells: before.cells.slice(0, 2) };
    const comparison = compareJournalEntries(before, modified);
    expect(comparison.removed).toBe(2);
    expect(comparison.rows.filter((row) => row.kind === "removed").map((row) => row.id))
      .toEqual(["cell-03", "cell-04"]);
  });

  it("refuses cross-region comparisons", () => {
    const entry = history(read()).entries[0]!;
    expect(() => compareJournalEntries({ ...entry, regionId: "other" }, entry)).toThrow();
  });

  it("matches unchanged copies when all metadata agrees", () => {
    const entry = history(read()).entries[0]!;
    const comparison = compareJournalEntries(entry, { ...entry, sequence: 2 });
    expect(comparison.unchanged).toBe(4);
    expect(comparison.newlySaved).toBe(0);
    expect(comparison.newlyUnknown).toBe(0);
  });
});

describe("journal search and pagination", () => {
  const comparison = latestJournalComparison(history(read(), read(full(), nextTime)))!;

  it("shows every row in original manifest order", () => {
    expect(page(comparison).rows.map((row) => row.id)).toEqual(
      ["cell-01", "cell-02", "cell-03", "cell-04"],
    );
  });

  it("filters by saved status", () => {
    expect(page(comparison, { filter: "saved" }).total).toBe(4);
  });

  it("filters UNKNOWN without converting it to saved", () => {
    const reading = latestJournalComparison(history(read()))!;
    expect(page(reading, { filter: "UNKNOWN" }).total).toBe(3);
  });

  it("filters only changed rows", () => {
    expect(page(comparison, { filter: "changed" }).total).toBe(3);
  });

  it("filters cases requiring manual inspection", () => {
    const result = latestJournalComparison(history(read(null)))!;
    expect(page(result, { filter: "needs-inspection" }).total).toBe(0);
  });

  it("searches source names without case sensitivity", () => {
    expect(page(comparison, { search: " MUNICIPAL " }).total).toBe(2);
    expect(page(comparison, { search: "provincial" }).total).toBe(2);
  });

  it("searches exact cell IDs", () => {
    expect(page(comparison, { search: "cell-03" }).rows.map((item) => item.id)).toEqual(["cell-03"]);
  });

  it("searches reason labels through diagnostic codes", () => {
    const result = latestJournalComparison(history(read()))!;
    expect(page(result, { search: "stale" }).rows.map((row) => row.id)).toEqual(["cell-03"]);
  });

  it("supports a deterministic ID ordering", () => {
    const a = page(comparison, { sort: "id" });
    const b = page(comparison, { sort: "id" });
    expect(a).toEqual(b);
  });

  it("supports a deterministic size ordering", () => {
    expect(page(comparison, { sort: "size" }).rows.map((row) => row.id))
      .toEqual(["cell-04", "cell-03", "cell-02", "cell-01"]);
  });

  it("supports the status ordering", () => {
    const a = page(comparison, { sort: "status" });
    expect(a.total).toBe(4);
  });

  it("paginates without repeating cell identifiers", () => {
    const ids: string[] = [];
    for (let p = 0; p < 4; p += 1) {
      const result = page(comparison, { page: p, pageSize: 1 });
      expect(result.rows).toHaveLength(1);
      ids.push(result.rows[0]!.id);
      expect(result.hasNext).toBe(p < 3);
      expect(result.hasPrevious).toBe(p > 0);
    }
    expect(ids).toEqual(["cell-01", "cell-02", "cell-03", "cell-04"]);
  });

  it("clamps negative and overlong page indexes", () => {
    expect(page(comparison, { page: -100, pageSize: 1 }).page).toBe(0);
    expect(page(comparison, { page: 100, pageSize: 1 }).page).toBe(3);
  });

  it("caps user-supplied page size", () => {
    expect(page(comparison, { pageSize: 100_000 }).rows).toHaveLength(4);
    expect(page(comparison, { pageSize: 0 }).rows).toHaveLength(1);
  });

  it("searches only recorded metadata, not downloaded bytes", () => {
    expect(page(comparison, { search: "Uint8Array" }).total).toBe(0);
    expect(page(comparison, { search: "payload" }).total).toBe(0);
  });

  it("returns an empty first page with safe navigation flags", () => {
    const result = page(comparison, { search: "not-in-records" });
    expect(result.page).toBe(0);
    expect(result.pages).toBe(1);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrevious).toBe(false);
  });
});

describe("journal user guidance", () => {
  it("suggests download only for missing or stale copies", () => {
    expect(journalActionForCell({ id: "a", status: "UNKNOWN", cause: "missing",
      bytes: 1, provenance: source })).toBe("download");
    expect(journalActionForCell({ id: "a", status: "UNKNOWN", cause: "stale",
      bytes: 1, provenance: source })).toBe("download");
  });

  it("suggests source review for metadata conflict", () => {
    expect(journalActionForCell({ id: "a", status: "UNKNOWN", cause: "metadata-conflict",
      bytes: 1, provenance: source })).toBe("review-source");
  });

  it("does not recommend download for unreadable entries", () => {
    for (const cause of ["unreadable", "not-inspected", "invalid-listing"] as const) {
      expect(journalActionForCell({ id: "a", status: "UNKNOWN", cause,
        bytes: null, provenance: null })).toBe("inspect");
    }
  });

  it("does not offer recovery when a copy is saved", () => {
    expect(journalActionForCell({ id: "a", status: "saved", cause: "present",
      bytes: 1, provenance: source })).toBe("none");
  });

  it("formats byte counts without inferring UNKNOWN", () => {
    expect(formatJournalByteCount(null, "en")).toBe("UNKNOWN");
    expect(formatJournalByteCount(-1, "fr")).toBe("UNKNOWN");
    expect(formatJournalByteCount(10, "en")).toContain("10 B");
  });
});
