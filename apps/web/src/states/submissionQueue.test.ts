import { describe, expect, it, vi } from "vitest";
import {
  BACKOFF_MAX_MS, MAX_QUEUE, QUEUE_KEY, backoffMs, buildSubmission, createQueue, flushQueue, parseQueue, validateCorrection,
  type Submission,
} from "./index";
import { MemoryStore } from "./testHelpers";

function sub(n: number): Submission {
  const r = validateCorrection({ placeId: "hall", feature: "elevator", suggested: "yes" }, new Set(["hall"]));
  if (!r.ok) throw new Error("valid input expected");
  return buildSubmission(r.value, { id: `sub-${String(n).padStart(8, "0")}`, createdOn: "2026-11-15" });
}

describe("backoffMs", () => {
  it("doubles from 30 s and is capped at one hour", () => {
    expect([0, 1, 2, 3, 4].map(backoffMs)).toEqual([0, 30_000, 60_000, 120_000, 240_000]);
    expect(backoffMs(50)).toBe(BACKOFF_MAX_MS);
    expect(backoffMs(-1)).toBe(0);
    expect(backoffMs(NaN)).toBe(0);
  });
});

describe("parseQueue", () => {
  it("returns an empty list for missing, malformed or wrong-version data", () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue("{not json")).toEqual([]);
    expect(parseQueue(JSON.stringify({ v: 2, items: [sub(1)] }))).toEqual([]);
    expect(parseQueue(JSON.stringify({ v: 1, items: "x" }))).toEqual([]);
  });
  it("drops invalid items and keeps valid ones", () => {
    const bad = [
      { ...sub(2), id: "x" },
      { ...sub(3), status: "weird" },
      { ...sub(4), attempts: -1 },
      { ...sub(5), createdOn: "2026-02-31" },
      { ...sub(6), payload: { ...sub(6).payload, feature: "teleporter" } },
      { ...sub(7), payload: { ...sub(7).payload, placeId: "../x" } },
      { ...sub(8), payload: { ...sub(8).payload, note: "x".repeat(501) } },
      null, 5, "s",
    ];
    const out = parseQueue(JSON.stringify({ v: 1, items: [sub(1), ...bad] }));
    expect(out.map((s) => s.id)).toEqual([sub(1).id]);
  });
});

describe("createQueue", () => {
  it("persists, lists and de-duplicates", () => {
    const store = new MemoryStore();
    const q = createQueue(store);
    expect(q.enqueue(sub(1))).toBe("ok");
    expect(q.enqueue(sub(1))).toBe("duplicate");
    expect(createQueue(store).list()).toHaveLength(1);
    expect(store.data.has(QUEUE_KEY)).toBe(true);
  });
  it("refuses more than the maximum", () => {
    const q = createQueue(new MemoryStore());
    for (let i = 0; i < MAX_QUEUE; i++) expect(q.enqueue(sub(i))).toBe("ok");
    expect(q.enqueue(sub(999))).toBe("queue-full");
  });
  it("marks sent (removed), failed (backoff) and rejected", () => {
    const store = new MemoryStore();
    const q = createQueue(store);
    q.enqueue(sub(1)); q.enqueue(sub(2)); q.enqueue(sub(3));
    q.markSent(sub(1).id);
    q.markFailed(sub(2).id, 1_000);
    q.markRejected(sub(3).id);
    const items = q.list();
    expect(items.map((s) => s.id)).toEqual([sub(2).id, sub(3).id]);
    expect(items[0]).toMatchObject({ attempts: 1, nextAttemptAt: 31_000 });
    expect(q.pending().map((s) => s.id)).toEqual([sub(2).id]);
    q.markSent(sub(2).id); q.markSent(sub(3).id);
    expect(store.data.has(QUEUE_KEY)).toBe(false);
  });
  it("survives a store that throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("x"); } };
    const q = createQueue(broken);
    expect(q.list()).toEqual([]);
    expect(() => q.enqueue(sub(1))).not.toThrow();
  });
});

describe("flushQueue", () => {
  const fresh = () => { const q = createQueue(new MemoryStore()); [1, 2, 3].forEach((n) => q.enqueue(sub(n))); return q; };

  it("does nothing offline", async () => {
    const send = vi.fn();
    const r = await flushQueue(fresh(), send, { online: false, nowMs: 0 });
    expect(r).toEqual({ sent: 0, rejected: 0, retried: 0, skipped: 3, offline: true });
    expect(send).not.toHaveBeenCalled();
  });
  it("sends in order and clears sent items", async () => {
    const q = fresh();
    const seen: string[] = [];
    const r = await flushQueue(q, async (s) => { seen.push(s.id); return "ok"; }, { online: true, nowMs: 0 });
    expect(seen).toEqual([sub(1).id, sub(2).id, sub(3).id]);
    expect(r.sent).toBe(3);
    expect(q.list()).toEqual([]);
  });
  it("stops at the first retry, applies backoff and keeps order", async () => {
    const q = fresh();
    const send = vi.fn(async (s: Submission) => (s.id === sub(2).id ? "retry" as const : "ok" as const));
    const r = await flushQueue(q, send, { online: true, nowMs: 5_000 });
    expect(r).toMatchObject({ sent: 1, retried: 1, skipped: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    const left = q.list();
    expect(left.map((s) => s.id)).toEqual([sub(2).id, sub(3).id]);
    expect(left[0]).toMatchObject({ attempts: 1, nextAttemptAt: 35_000 });
  });
  it("skips items inside their backoff window", async () => {
    const q = fresh();
    q.markFailed(sub(1).id, 0); // next attempt at 30 s
    const send = vi.fn(async () => "ok" as const);
    const r = await flushQueue(q, send, { online: true, nowMs: 10_000 });
    expect(r).toMatchObject({ sent: 2, skipped: 1 });
    expect(q.list().map((s) => s.id)).toEqual([sub(1).id]);
  });
  it("treats a thrown error as retry and a reject as final", async () => {
    const q = fresh();
    const throwing = await flushQueue(q, async () => { throw new Error("network"); }, { online: true, nowMs: 0 });
    expect(throwing.retried).toBe(1);
    const q2 = fresh();
    const rejecting = await flushQueue(q2, async () => "reject", { online: true, nowMs: 0 });
    expect(rejecting.rejected).toBe(3);
    expect(q2.pending()).toEqual([]);
    expect(q2.list()).toHaveLength(3);
  });
});
