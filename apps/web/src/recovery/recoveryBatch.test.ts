import { describe, expect, it } from "vitest";
import { planPackRepairs } from "./recoveryPolicy";
import {
  calculateStorageBudget, countBatchStages, createRecoveryBatch, parseQuotaInput,
  reconcileRecoveryBatch, recoveryBatchCopy, updateRecoveryBatch,
  type BatchDecision, type RecoveryBatch,
} from "./recoveryBatch";

const source = { name: "Local data", licence: "CC0-1.0", date: "2026-09-10" };
const records = [
  { id: "a", state: "absent" as const },
  { id: "b", state: "corrupt" as const, byteLength: 40 },
  { id: "c", state: "unknown" as const, byteLength: 20 },
  { id: "d", state: "ready" as const, byteLength: 50, source },
];
const policy = planPackRepairs(records, { date: "2026-11-15" });
const initial = () => createRecoveryBatch(policy.recommendations);
const update = (batch: RecoveryBatch, id: string, decision: BatchDecision) =>
  updateRecoveryBatch(batch, { id, decision, userInitiated: true });

function progress(id: string, decisions: readonly BatchDecision[]): RecoveryBatch {
  let batch = initial();
  for (const decision of decisions) {
    const outcome = update(batch, id, decision);
    if (!outcome.ok) throw new Error(`Could not apply ${decision}`);
    batch = outcome.batch;
  }
  return batch;
}

describe("manual recovery batch", () => {
  it("separates damaged, unknown and ready packs", () => {
    const batch = initial();
    expect(batch.items.map((x) => [x.id, x.stage])).toEqual([
      ["a", "pending"], ["b", "pending"], ["c", "unknown"], ["d", "done"],
    ]);
    expect(countBatchStages(batch)).toEqual({
      total: 4, selected: 0, waiting: 0, recheck: 0, done: 1, unknown: 1,
    });
  });

  it("never initiates external work by selecting an item", () => {
    const before = initial();
    const result = update(before, "a", "select");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.items[0]?.stage).toBe("selected");
    expect(before.items[0]?.stage).toBe("pending");
    expect(result.batch.revision).toBe(1);
  });

  it("supports explicit manual staging", () => {
    const batch = progress("b", ["select", "mark-waiting", "mark-recheck"]);
    expect(batch.items[1]?.stage).toBe("recheck");
    expect(batch.items[1]?.contentReady).toBe(false);
    expect(batch.revision).toBe(3);
  });

  it("prevents a manual completion of damaged bytes", () => {
    const batch = progress("b", ["select", "mark-waiting", "mark-recheck"]);
    const result = update(batch, "b", "mark-done");
    expect(result).toEqual({ ok: false, reason: "invalid-transition" });
  });

  it("can return a waiting item to the original queue", () => {
    const batch = progress("b", ["select", "mark-waiting", "reset"]);
    expect(batch.items[1]?.stage).toBe("pending");
  });

  it("can unselect without changing the stored pack", () => {
    const batch = progress("a", ["select", "unselect"]);
    expect(batch.items[0]?.stage).toBe("pending");
  });

  it("requires an explicit user action", () => {
    const result = updateRecoveryBatch(initial(), {
      id: "a", decision: "select", userInitiated: false,
    });
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects missing or unsafe identifiers", () => {
    expect(update(initial(), "unknown-id", "select")).toEqual({ ok: false, reason: "missing" });
    expect(update(initial(), "../a", "select")).toEqual({ ok: false, reason: "unsafe" });
  });

  it.each([
    ["pending", "mark-waiting"], ["pending", "mark-recheck"],
    ["pending", "mark-done"], ["pending", "unselect"],
    ["done", "select"], ["done", "mark-waiting"],
    ["done", "mark-recheck"], ["done", "mark-done"],
    ["unknown", "unselect"], ["unknown", "mark-done"],
  ] as const)("rejects %s to %s transition", (stage, decision) => {
    const item = initial().items.find((candidate) => candidate.stage === stage);
    expect(item).toBeDefined();
    const result = update(initial(), item!.id, decision);
    expect(result).toEqual({ ok: false, reason: "invalid-transition" });
  });

  it("does not keep an earlier done state after a damaged inspection", () => {
    const first = initial();
    const updated = planPackRepairs([
      { id: "d", state: "corrupt", source, byteLength: 50 },
    ], { date: "2026-11-15" });
    const next = reconcileRecoveryBatch(first, updated.recommendations);
    expect(next.items[0]?.stage).toBe("unknown");
    expect(next.items[0]?.contentReady).toBe(false);
  });

  it("returns a waiting item for a new local check", () => {
    const waiting = progress("b", ["select", "mark-waiting"]);
    const next = reconcileRecoveryBatch(waiting, policy.recommendations);
    expect(next.items[1]?.stage).toBe("recheck");
    expect(next.items[1]?.contentReady).toBe(false);
  });

  it("promotes only a newly inspected ready file", () => {
    const waiting = progress("b", ["select", "mark-waiting"]);
    const updated = planPackRepairs([
      { id: "b", state: "ready", source, byteLength: 40 },
    ], { date: "2026-11-15" });
    const next = reconcileRecoveryBatch(waiting, updated.recommendations);
    expect(next.items[0]?.stage).toBe("done");
    expect(next.items[0]?.contentReady).toBe(true);
  });

  it("keeps selected items selected after unchanged inspection", () => {
    const selected = progress("a", ["select"]);
    expect(reconcileRecoveryBatch(selected, policy.recommendations).items[0]?.stage).toBe("selected");
  });

  it("ignores duplicate and unsafe IDs when constructing the queue", () => {
    const copies = [
      policy.recommendations[0]!, policy.recommendations[0]!,
      { ...policy.recommendations[1]!, id: "a/b" },
    ];
    expect(createRecoveryBatch(copies).items.map((x) => x.id)).toEqual(["a"]);
  });

  it("caps the in-memory queue", () => {
    const many = Array.from({ length: 700 }, (_, i) => ({
      ...policy.recommendations[0]!, id: `item-${i}`,
    }));
    expect(createRecoveryBatch(many).items).toHaveLength(500);
  });

  it("blocks mutation when revision exceeds the limit", () => {
    const result = update({ ...initial(), revision: 100000 }, "a", "select");
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });
});

describe("offline storage estimate", () => {
  it("treats missing available space as UNKNOWN", () => {
    const batch = progress("b", ["select"]);
    expect(calculateStorageBudget(batch, null)).toEqual({
      remainingBytes: null, selectedBytes: 40, unknownSizeCount: 0, enough: "unknown",
    });
  });

  it("treats missing file size as UNKNOWN", () => {
    const batch = progress("a", ["select"]);
    const budget = calculateStorageBudget(batch, 200);
    expect(budget.enough).toBe("unknown");
    expect(budget.unknownSizeCount).toBe(1);
  });

  it("does not infer room when selected size exceeds supplied space", () => {
    const batch = progress("b", ["select"]);
    expect(calculateStorageBudget(batch, 39).enough).toBe("no");
  });

  it("allows an exact numeric match without inventing extra space", () => {
    const batch = progress("b", ["select"]);
    expect(calculateStorageBudget(batch, 40).enough).toBe("yes");
    expect(calculateStorageBudget(batch, 40).selectedBytes).toBe(40);
  });

  it("does not include unselected packs", () => {
    const batch = initial();
    expect(calculateStorageBudget(batch, 0)).toEqual({
      selectedBytes: 0, unknownSizeCount: 0, remainingBytes: 0, enough: "yes",
    });
  });

  it("counts waiting packs as selected bytes", () => {
    const batch = progress("b", ["select", "mark-waiting"]);
    expect(calculateStorageBudget(batch, 39).selectedBytes).toBe(40);
  });

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quota input %s", (available) => {
      expect(calculateStorageBudget(initial(), available).enough).toBe("unknown");
    },
  );

  it.each(["-1", "1.5", "1e4", "Infinity", "NaN", "1,000", "00", "0xFF"])(
    "rejects malformed text quota %s", (value) => {
      expect(parseQuotaInput(value)).toBe("invalid");
    },
  );

  it.each(["", "  ", "\t"])("accepts missing quota %s as UNKNOWN", (value) => {
    expect(parseQuotaInput(value)).toBeNull();
  });

  it.each(["0", "12", "50000", "9007199254740991"])(
    "accepts non-negative integer quota %s", (value) => {
      expect(parseQuotaInput(value)).toBe(Number(value));
    },
  );

  it("uses separate EN and FR labels for controls and statuses", () => {
    const en = recoveryBatchCopy("en");
    const fr = recoveryBatchCopy("fr");
    for (const key of ["select", "unselect", "mark-waiting", "mark-recheck", "mark-done", "reset"] as const) {
      expect(en.decisions[key]).not.toBe(fr.decisions[key]);
      expect(fr.decisions[key].length).toBeGreaterThan(3);
    }
    for (const key of ["pending", "selected", "waiting", "recheck", "done", "unknown"] as const) {
      expect(en.stages[key].length).toBeGreaterThan(2);
      expect(fr.stages[key].length).toBeGreaterThan(2);
    }
  });
});
