import { describe, expect, it } from "vitest";
import {
  appendReviewEvent, clearReviewLog, compareInspections, comparisonCopy, emptyReviewLog,
} from "./recoveryComparison";
import type { LocalPackRecord } from "./packInventory";

const source = { name: "Public list", licence: "OGL-ON-1.0", date: "2026-11-01" };
const pack = (id: string, state: LocalPackRecord["state"] = "ready"): LocalPackRecord => ({
  id, state, source, byteLength: 100,
});

describe("explicit snapshot comparison", () => {
  it("compares empty snapshots", () => {
    expect(compareInspections([], [])).toEqual({
      changes: [], unchangedCount: 0, rejectedCount: 0,
      previousCount: 0, currentCount: 0, hasUncertainChanges: false,
    });
  });
  it("reports identical copies as unchanged", () => {
    const result = compareInspections([pack("west"), pack("east")], [pack("east"), pack("west")]);
    expect(result.changes).toEqual([]);
    expect(result.unchangedCount).toBe(2);
  });
  it("detects a newly listed pack", () => {
    expect(compareInspections([], [pack("east")]).changes).toEqual([
      { id: "east", kind: "added", before: null, after: "ready" },
    ]);
  });
  it("detects a removed pack", () => {
    expect(compareInspections([pack("east")], []).changes).toEqual([
      { id: "east", kind: "removed", before: "ready", after: null },
    ]);
  });
  it("does not treat a newly listed pack as proof of service conditions", () => {
    expect(compareInspections([], [pack("east", "unknown")]).hasUncertainChanges).toBe(true);
  });
  it("reports a transition from damaged to ready", () => {
    const result = compareInspections([pack("east", "corrupt")], [pack("east", "ready")]);
    expect(result.changes[0]?.kind).toBe("became-ready");
    expect(result.hasUncertainChanges).toBe(false);
  });
  it("reports a transition from ready to UNKNOWN", () => {
    const result = compareInspections([pack("east", "ready")], [pack("east", "unknown")]);
    expect(result.changes[0]?.kind).toBe("no-longer-ready");
    expect(result.hasUncertainChanges).toBe(true);
  });
  it("reports a transition from UNKNOWN to absent", () => {
    const result = compareInspections([pack("east", "unknown")], [pack("east", "absent")]);
    expect(result.changes[0]?.kind).toBe("state-changed");
  });
  it("detects a changed source name", () => {
    const before = pack("east");
    const after = { ...before, source: { ...source, name: "Another list" } };
    expect(compareInspections([before], [after]).changes[0]?.kind).toBe("source-changed");
  });
  it("detects a changed licence", () => {
    const before = pack("east");
    const after = { ...before, source: { ...source, licence: "CC-BY-4.0" } };
    expect(compareInspections([before], [after]).changes[0]?.kind).toBe("source-changed");
  });
  it("detects a changed source date", () => {
    const before = pack("east");
    const after = { ...before, source: { ...source, date: "2026-11-02" } };
    expect(compareInspections([before], [after]).changes[0]?.kind).toBe("source-changed");
  });
  it("detects a changed file size", () => {
    const before = pack("east");
    const after = { ...before, byteLength: 101 };
    expect(compareInspections([before], [after]).changes[0]?.kind).toBe("size-changed");
  });
  it("prefers changed state over changed source", () => {
    const before = pack("east", "ready");
    const after = { ...pack("east", "corrupt"), source: { ...source, name: "New" } };
    expect(compareInspections([before], [after]).changes[0]?.kind).toBe("no-longer-ready");
  });
  it("does not include unsafe identifiers", () => {
    const result = compareInspections([pack("../secret")], [pack("east")]);
    expect(result.rejectedCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain("../secret");
    expect(result.hasUncertainChanges).toBe(true);
  });
  it("does not count duplicates as separate changes", () => {
    const result = compareInspections([pack("east"), pack("east")], [pack("east")]);
    expect(result.rejectedCount).toBe(1);
    expect(result.unchangedCount).toBe(1);
    expect(result.changes).toEqual([]);
  });
  it("orders changes by stable pack ID", () => {
    const result = compareInspections([], [pack("west"), pack("east"), pack("north")]);
    expect(result.changes.map((change) => change.id)).toEqual(["east", "north", "west"]);
  });
  it("does not mutate either snapshot", () => {
    const before = Object.freeze([Object.freeze(pack("west"))]);
    const after = Object.freeze([Object.freeze(pack("east"))]);
    expect(() => compareInspections(before, after)).not.toThrow();
  });
});

describe("volatile local session log", () => {
  it("starts empty and with the first sequence", () => {
    expect(emptyReviewLog()).toEqual({ entries: [], nextSequence: 1 });
  });
  it("adds a manual review event", () => {
    const event = { action: "review" as const, outcome: "complete" as const, packId: "east", date: "2026-11-15" };
    const log = appendReviewEvent(emptyReviewLog(), event);
    expect(log.entries).toEqual([{ ...event, sequence: 1 }]);
    expect(log.nextSequence).toBe(2);
  });
  it("refuses unsupported pack identifiers", () => {
    const old = emptyReviewLog();
    expect(appendReviewEvent(old, {
      action: "inspect", outcome: "unknown", packId: "../bad", date: "2026-11-15",
    })).toBe(old);
  });
  it("refuses an unsupported date format", () => {
    const old = emptyReviewLog();
    expect(appendReviewEvent(old, {
      action: "inspect", outcome: "unknown", packId: "east", date: "2026/11/15",
    })).toBe(old);
  });
  it("does not store arbitrary thrown error text", () => {
    const old = emptyReviewLog();
    const next = appendReviewEvent(old, {
      action: "download", outcome: "failed", packId: "east", date: "2026-11-15",
    });
    expect(JSON.stringify(next)).not.toContain("stack");
    expect(Object.keys(next.entries[0] ?? {})).toEqual(["sequence", "action", "outcome", "packId", "date"]);
  });
  it("keeps the most recent fifty events", () => {
    let log = emptyReviewLog();
    for (let i = 0; i < 70; i++) {
      log = appendReviewEvent(log, {
        action: "inspect", outcome: "complete", packId: null, date: "2026-11-15",
      });
    }
    expect(log.entries).toHaveLength(50);
    expect(log.entries[0]?.sequence).toBe(21);
    expect(log.entries[49]?.sequence).toBe(70);
    expect(log.nextSequence).toBe(71);
  });
  it("does not mutate previous log objects", () => {
    const previous = emptyReviewLog();
    appendReviewEvent(previous, { action: "review", outcome: "unknown", packId: null, date: "2026-11-15" });
    expect(previous.entries).toHaveLength(0);
  });
  it("clears all entries without transferring any data", () => {
    const next = clearReviewLog();
    expect(next).toEqual(emptyReviewLog());
  });
});

describe("comparison translations", () => {
  it("has both languages for every change and outcome", () => {
    for (const locale of ["en", "fr"] as const) {
      const copy = comparisonCopy(locale);
      expect(copy.heading).not.toBe("");
      for (const value of Object.values(copy.changes)) expect(value.trim()).not.toBe("");
      for (const value of Object.values(copy.outcomes)) expect(value.trim()).not.toBe("");
      for (const value of Object.values(copy.events)) expect(value.trim()).not.toBe("");
    }
  });
  it("uses explicit UNKNOWN wording", () => {
    expect(comparisonCopy("en").outcomes.unknown).toBe("UNKNOWN");
    expect(comparisonCopy("fr").outcomes.unknown).toBe("INCONNU");
  });
});
