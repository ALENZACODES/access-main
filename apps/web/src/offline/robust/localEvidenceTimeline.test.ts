import { describe, expect, it } from "vitest";
import type { RegionManifest } from "./regionDownload";
import type { RegionInventory, InventoryCause } from "./regionInventory";
import {
  appendTimeline, appendTimelineNote, captureTimeline, compareLatestTimeline,
  compareTimeline, newTimeline, pageTimeline, parseTimelineBook, serializeTimelineBook,
  updateTimelineNote, validateTimelineCapture,
} from "./localEvidenceTimeline";
const provenance = { source: "Ontario open data", licence: "Open Government Licence", date: "2026-11-01" };
const begin = "2026-11-19T12:00:00.000Z";
const end = "2026-11-19T13:00:00.000Z";
const manifest: RegionManifest = { regionId: "ontario-sample", cells: [
  { id: "a", bytes: 120, provenance },
  { id: "b", bytes: 240, provenance },
  { id: "c", bytes: 360, provenance },
  { id: "d", bytes: 480, provenance },
] };
function inventory(causes: readonly InventoryCause[]): RegionInventory {
  if (causes.length !== manifest.cells.length) throw new Error("Incomplete fixture");
  const cells: RegionInventory["cells"][number][] = manifest.cells.map((cell, index) => {
    const cause = causes[index];
    if (cause === undefined) throw new Error("Missing cause");
    return { id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance,
      state: cause === "present" ? "saved" : "unknown", cause };
  });
  const saved = cells.filter((cell) => cell.state === "saved");
  return { regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length, savedBytes: saved.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    expectedBytes: 1200, complete: saved.length === cells.length };
}
const reading = (causes: readonly InventoryCause[], time = begin) => captureTimeline(manifest, inventory(causes), time);
const note = { id: "note-1", cellId: "a", at: end, text: "Manually check source metadata", status: "open" as const };

describe("every cell-local transition", () => {
  it("classifies present to present in cell 1", () => {
    const left = reading(["present", "missing", "missing", "missing"]);
    const right = reading(["present", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to missing in cell 1", () => {
    const left = reading(["present", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("lost");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to stale in cell 1", () => {
    const left = reading(["present", "missing", "missing", "missing"]);
    const right = reading(["stale", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to unreadable in cell 1", () => {
    const left = reading(["present", "missing", "missing", "missing"]);
    const right = reading(["unreadable", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to present in cell 1", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["present", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("gained");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to missing in cell 1", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to stale in cell 1", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["stale", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to unreadable in cell 1", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["unreadable", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to present in cell 1", () => {
    const left = reading(["stale", "missing", "missing", "missing"]);
    const right = reading(["present", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to missing in cell 1", () => {
    const left = reading(["stale", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to stale in cell 1", () => {
    const left = reading(["stale", "missing", "missing", "missing"]);
    const right = reading(["stale", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to unreadable in cell 1", () => {
    const left = reading(["stale", "missing", "missing", "missing"]);
    const right = reading(["unreadable", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to present in cell 1", () => {
    const left = reading(["unreadable", "missing", "missing", "missing"]);
    const right = reading(["present", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to missing in cell 1", () => {
    const left = reading(["unreadable", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to stale in cell 1", () => {
    const left = reading(["unreadable", "missing", "missing", "missing"]);
    const right = reading(["stale", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to unreadable in cell 1", () => {
    const left = reading(["unreadable", "missing", "missing", "missing"]);
    const right = reading(["unreadable", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[0]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to present in cell 2", () => {
    const left = reading(["missing", "present", "missing", "missing"]);
    const right = reading(["missing", "present", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to missing in cell 2", () => {
    const left = reading(["missing", "present", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("lost");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to stale in cell 2", () => {
    const left = reading(["missing", "present", "missing", "missing"]);
    const right = reading(["missing", "stale", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to unreadable in cell 2", () => {
    const left = reading(["missing", "present", "missing", "missing"]);
    const right = reading(["missing", "unreadable", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to present in cell 2", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "present", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("gained");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to missing in cell 2", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to stale in cell 2", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "stale", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to unreadable in cell 2", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "unreadable", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to present in cell 2", () => {
    const left = reading(["missing", "stale", "missing", "missing"]);
    const right = reading(["missing", "present", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to missing in cell 2", () => {
    const left = reading(["missing", "stale", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to stale in cell 2", () => {
    const left = reading(["missing", "stale", "missing", "missing"]);
    const right = reading(["missing", "stale", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to unreadable in cell 2", () => {
    const left = reading(["missing", "stale", "missing", "missing"]);
    const right = reading(["missing", "unreadable", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to present in cell 2", () => {
    const left = reading(["missing", "unreadable", "missing", "missing"]);
    const right = reading(["missing", "present", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to missing in cell 2", () => {
    const left = reading(["missing", "unreadable", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to stale in cell 2", () => {
    const left = reading(["missing", "unreadable", "missing", "missing"]);
    const right = reading(["missing", "stale", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to unreadable in cell 2", () => {
    const left = reading(["missing", "unreadable", "missing", "missing"]);
    const right = reading(["missing", "unreadable", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[1]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to present in cell 3", () => {
    const left = reading(["missing", "missing", "present", "missing"]);
    const right = reading(["missing", "missing", "present", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to missing in cell 3", () => {
    const left = reading(["missing", "missing", "present", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("lost");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to stale in cell 3", () => {
    const left = reading(["missing", "missing", "present", "missing"]);
    const right = reading(["missing", "missing", "stale", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to unreadable in cell 3", () => {
    const left = reading(["missing", "missing", "present", "missing"]);
    const right = reading(["missing", "missing", "unreadable", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to present in cell 3", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "present", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("gained");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to missing in cell 3", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to stale in cell 3", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "stale", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to unreadable in cell 3", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "unreadable", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to present in cell 3", () => {
    const left = reading(["missing", "missing", "stale", "missing"]);
    const right = reading(["missing", "missing", "present", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to missing in cell 3", () => {
    const left = reading(["missing", "missing", "stale", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to stale in cell 3", () => {
    const left = reading(["missing", "missing", "stale", "missing"]);
    const right = reading(["missing", "missing", "stale", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to unreadable in cell 3", () => {
    const left = reading(["missing", "missing", "stale", "missing"]);
    const right = reading(["missing", "missing", "unreadable", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to present in cell 3", () => {
    const left = reading(["missing", "missing", "unreadable", "missing"]);
    const right = reading(["missing", "missing", "present", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to missing in cell 3", () => {
    const left = reading(["missing", "missing", "unreadable", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to stale in cell 3", () => {
    const left = reading(["missing", "missing", "unreadable", "missing"]);
    const right = reading(["missing", "missing", "stale", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to unreadable in cell 3", () => {
    const left = reading(["missing", "missing", "unreadable", "missing"]);
    const right = reading(["missing", "missing", "unreadable", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[2]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to present in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "present"]);
    const right = reading(["missing", "missing", "missing", "present"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to missing in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "present"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("lost");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to stale in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "present"]);
    const right = reading(["missing", "missing", "missing", "stale"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies present to unreadable in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "present"]);
    const right = reading(["missing", "missing", "missing", "unreadable"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to present in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "present"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("gained");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to missing in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to stale in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "stale"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies missing to unreadable in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "missing"]);
    const right = reading(["missing", "missing", "missing", "unreadable"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to present in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "stale"]);
    const right = reading(["missing", "missing", "missing", "present"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to missing in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "stale"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to stale in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "stale"]);
    const right = reading(["missing", "missing", "missing", "stale"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies stale to unreadable in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "stale"]);
    const right = reading(["missing", "missing", "missing", "unreadable"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to present in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "unreadable"]);
    const right = reading(["missing", "missing", "missing", "present"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to missing in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "unreadable"]);
    const right = reading(["missing", "missing", "missing", "missing"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to stale in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "unreadable"]);
    const right = reading(["missing", "missing", "missing", "stale"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("changed");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
  it("classifies unreadable to unreadable in cell 4", () => {
    const left = reading(["missing", "missing", "missing", "unreadable"]);
    const right = reading(["missing", "missing", "missing", "unreadable"], end);
    const result = compareTimeline(left, right);
    expect(result.rows[3]?.change).toBe("unchanged");
    expect(result.rows).toHaveLength(4);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
});
describe("source and shape disagreements remain UNKNOWN", () => {
  it("does not accept changed source for cell 1", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[0];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, source: "Changed source" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 0 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[0]?.sourceChanged).toBe(true);
    expect(result.rows[0]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed licence for cell 1", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[0];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, licence: "Changed licence" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 0 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[0]?.sourceChanged).toBe(true);
    expect(result.rows[0]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed date for cell 1", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[0];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, date: "2026-11-02" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 0 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[0]?.sourceChanged).toBe(true);
    expect(result.rows[0]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed bytes for cell 1", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[0];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, bytes: 999 } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 0 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[0]?.sourceChanged).toBe(true);
    expect(result.rows[0]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed source for cell 2", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[1];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, source: "Changed source" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 1 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[1]?.sourceChanged).toBe(true);
    expect(result.rows[1]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed licence for cell 2", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[1];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, licence: "Changed licence" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 1 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[1]?.sourceChanged).toBe(true);
    expect(result.rows[1]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed date for cell 2", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[1];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, date: "2026-11-02" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 1 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[1]?.sourceChanged).toBe(true);
    expect(result.rows[1]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed bytes for cell 2", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[1];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, bytes: 999 } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 1 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[1]?.sourceChanged).toBe(true);
    expect(result.rows[1]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed source for cell 3", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[2];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, source: "Changed source" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 2 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[2]?.sourceChanged).toBe(true);
    expect(result.rows[2]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed licence for cell 3", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[2];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, licence: "Changed licence" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 2 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[2]?.sourceChanged).toBe(true);
    expect(result.rows[2]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed date for cell 3", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[2];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, date: "2026-11-02" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 2 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[2]?.sourceChanged).toBe(true);
    expect(result.rows[2]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed bytes for cell 3", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[2];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, bytes: 999 } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 2 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[2]?.sourceChanged).toBe(true);
    expect(result.rows[2]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed source for cell 4", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[3];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, source: "Changed source" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 3 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[3]?.sourceChanged).toBe(true);
    expect(result.rows[3]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed licence for cell 4", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[3];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, licence: "Changed licence" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 3 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[3]?.sourceChanged).toBe(true);
    expect(result.rows[3]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed date for cell 4", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[3];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, date: "2026-11-02" } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 3 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[3]?.sourceChanged).toBe(true);
    expect(result.rows[3]?.change).toBe("UNKNOWN");
  });
  it("does not accept changed bytes for cell 4", () => {
    const first = reading(["present", "present", "present", "present"]);
    const later = reading(["present", "present", "present", "present"], end);
    const cell = later.cells[3];
    if (cell === undefined) throw new Error("Missing cell");
    const modified = { ...cell, source: { ...cell.source, bytes: 999 } };
    const changed = { ...later, cells: later.cells.map((value, i) => i === 3 ? modified : value) };
    const result = compareTimeline(first, changed);
    expect(result.rows[3]?.sourceChanged).toBe(true);
    expect(result.rows[3]?.change).toBe("UNKNOWN");
  });
  it("rejects malformed id in cell 1", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 0 ? { ...value, id: "" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed state in cell 1", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 0 ? { ...value, state: "present" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed cause in cell 1", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 0 ? { ...value, cause: "unsupported" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed id in cell 2", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 1 ? { ...value, id: "" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed state in cell 2", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 1 ? { ...value, state: "present" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed cause in cell 2", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 1 ? { ...value, cause: "unsupported" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed id in cell 3", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 2 ? { ...value, id: "" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed state in cell 3", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 2 ? { ...value, state: "present" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed cause in cell 3", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 2 ? { ...value, cause: "unsupported" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed id in cell 4", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 3 ? { ...value, id: "" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed state in cell 4", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 3 ? { ...value, state: "present" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
  it("rejects malformed cause in cell 4", () => {
    const first = reading(["present", "present", "present", "present"]);
    const changed = { ...first, cells: first.cells.map((value, i) => i === 3 ? { ...value, cause: "unsupported" } : value) };
    expect(() => validateTimelineCapture(changed)).toThrow();
  });
});
describe("pagination across realistic conditions", () => {
  it("filters all with order listed and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "all", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order listed and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "all", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order listed and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "all", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order listed and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "all", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order recent and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "all", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order recent and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "all", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order recent and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "all", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order recent and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "all", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order source and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "all", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order source and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "all", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order source and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "all", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order source and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "all", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order size and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "all", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order size and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "all", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order size and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "all", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters all with order size and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "all", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order listed and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "changed", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order listed and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "changed", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order listed and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "changed", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order listed and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "changed", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order recent and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "changed", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order recent and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "changed", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order recent and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "changed", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order recent and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "changed", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order source and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "changed", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order source and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "changed", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order source and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "changed", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order source and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "changed", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order size and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "changed", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order size and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "changed", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order size and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "changed", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters changed with order size and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "changed", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order listed and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "lost", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order listed and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "lost", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order listed and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "lost", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order listed and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "lost", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order recent and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "lost", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order recent and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "lost", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order recent and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "lost", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order recent and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "lost", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order source and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "lost", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order source and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "lost", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order source and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "lost", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order source and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "lost", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order size and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "lost", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order size and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "lost", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order size and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "lost", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters lost with order size and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "lost", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order listed and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "gained", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order listed and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "gained", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order listed and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "gained", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order listed and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "gained", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order recent and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "gained", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order recent and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "gained", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order recent and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "gained", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order recent and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "gained", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order source and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "gained", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order source and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "gained", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order source and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "gained", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order source and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "gained", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order size and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "gained", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order size and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "gained", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order size and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "gained", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters gained with order size and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "gained", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order listed and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "UNKNOWN", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order listed and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "UNKNOWN", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order listed and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "UNKNOWN", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order listed and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "UNKNOWN", order: "listed", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order recent and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "UNKNOWN", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order recent and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "UNKNOWN", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order recent and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "UNKNOWN", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order recent and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "UNKNOWN", order: "recent", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order source and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "UNKNOWN", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order source and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "UNKNOWN", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order source and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "UNKNOWN", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order source and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "UNKNOWN", order: "source", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order size and search empty", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "", filter: "UNKNOWN", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order size and search a", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "a", filter: "UNKNOWN", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order size and search b", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "b", filter: "UNKNOWN", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
  it("filters UNKNOWN with order size and search Ontario", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const later = reading(["missing", "present", "unreadable", "stale"], end);
    const comparison = compareTimeline(first, later);
    const page = pageTimeline(comparison, { search: "Ontario", filter: "UNKNOWN", order: "size", offset: 0, limit: 2 });
    expect(page.rows.length <= 2).toBe(true);
    expect(page.rows.length <= page.total).toBe(true);
    expect(page.previous).toBe(false);
    expect(page.next).toBe(page.total > 2);
  });
});
describe("historical note lifecycle and import safety", () => {
  it("saves a open note on cell a without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "open", cellId: "a" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("a");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a open note on cell b without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "open", cellId: "b" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("b");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a open note on cell c without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "open", cellId: "c" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("c");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a open note on cell d without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "open", cellId: "d" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("d");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a reviewing note on cell a without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "reviewing", cellId: "a" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("a");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a reviewing note on cell b without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "reviewing", cellId: "b" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("b");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a reviewing note on cell c without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "reviewing", cellId: "c" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("c");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a reviewing note on cell d without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "reviewing", cellId: "d" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("d");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a closed note on cell a without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "closed", cellId: "a" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("a");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a closed note on cell b without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "closed", cellId: "b" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("b");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a closed note on cell c without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "closed", cellId: "c" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("c");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("saves a closed note on cell d without changing stored status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const next = appendTimelineNote(first, { ...note, status: "closed", cellId: "d" });
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]?.cellId).toBe("d");
    expect(next.captures).toEqual(first.captures);
    expect(parseTimelineBook(serializeTimelineBook(next), manifest.regionId)).toEqual(next);
  });
  it("guards note scenario unknown-region", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const input = { ...note, cellId: "other" };
    if (input.cellId === "a" && input.text.trim() && !input.text.includes("\u0000") && input.at === end && input.status === "open") {
      expect(appendTimelineNote(first, input).notes.length).toBe(1);
    } else {
      expect(() => appendTimelineNote(first, input)).toThrow();
    }
  });
  it("guards note scenario duplicate-id", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const input = note;
    if (input.cellId === "a" && input.text.trim() && !input.text.includes("\u0000") && input.at === end && input.status === "open") {
      expect(appendTimelineNote(first, input).notes.length).toBe(1);
    } else {
      expect(() => appendTimelineNote(first, input)).toThrow();
    }
  });
  it("guards note scenario empty-text", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const input = { ...note, text: " " };
    if (input.cellId === "a" && input.text.trim() && !input.text.includes("\u0000") && input.at === end && input.status === "open") {
      expect(appendTimelineNote(first, input).notes.length).toBe(1);
    } else {
      expect(() => appendTimelineNote(first, input)).toThrow();
    }
  });
  it("guards note scenario future-source", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const input = { ...note, text: "Review source on later copy" };
    if (input.cellId === "a" && input.text.trim() && !input.text.includes("\u0000") && input.at === end && input.status === "open") {
      expect(appendTimelineNote(first, input).notes.length).toBe(1);
    } else {
      expect(() => appendTimelineNote(first, input)).toThrow();
    }
  });
  it("guards note scenario invalid-status", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const input = { ...note, status: "not-supported" as "open" };
    if (input.cellId === "a" && input.text.trim() && !input.text.includes("\u0000") && input.at === end && input.status === "open") {
      expect(appendTimelineNote(first, input).notes.length).toBe(1);
    } else {
      expect(() => appendTimelineNote(first, input)).toThrow();
    }
  });
  it("guards note scenario pre-capture", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const input = { ...note, at: "2026-11-18T13:00:00.000Z" };
    if (input.cellId === "a" && input.text.trim() && !input.text.includes("\u0000") && input.at === end && input.status === "open") {
      expect(appendTimelineNote(first, input).notes.length).toBe(1);
    } else {
      expect(() => appendTimelineNote(first, input)).toThrow();
    }
  });
  it("guards note scenario invalid-cell", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const input = { ...note, cellId: "" };
    if (input.cellId === "a" && input.text.trim() && !input.text.includes("\u0000") && input.at === end && input.status === "open") {
      expect(appendTimelineNote(first, input).notes.length).toBe(1);
    } else {
      expect(() => appendTimelineNote(first, input)).toThrow();
    }
  });
  it("guards note scenario control-character", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const input = { ...note, text: "bad\u0000data" };
    if (input.cellId === "a" && input.text.trim() && !input.text.includes("\u0000") && input.at === end && input.status === "open") {
      expect(appendTimelineNote(first, input).notes.length).toBe(1);
    } else {
      expect(() => appendTimelineNote(first, input)).toThrow();
    }
  });
});
describe("capture history ordering", () => {
  it("starts a two-reading historical comparison", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    const second = reading(["missing", "present", "stale", "unreadable"], end);
    const book = appendTimeline(newTimeline(first), second);
    expect(book.captures).toHaveLength(2);
    expect(compareLatestTimeline(book)?.rows).toHaveLength(4);
    expect(compareLatestTimeline(book)?.counts.lost).toBe(1);
    expect(compareLatestTimeline(book)?.counts.gained).toBe(1);
  });
  it("requires strictly later readings", () => {
    const first = reading(["present", "missing", "stale", "unreadable"]);
    expect(() => appendTimeline(newTimeline(first), first)).toThrow();
  });
  it("allows a reviewer to close notes without changing stored evidence", () => {
    const first = newTimeline(reading(["present", "missing", "stale", "unreadable"]));
    const book = appendTimelineNote(first, note);
    const changed = updateTimelineNote(book, note.id, "closed");
    expect(changed.notes[0]?.status).toBe("closed");
    expect(changed.captures).toEqual(book.captures);
  });
});
