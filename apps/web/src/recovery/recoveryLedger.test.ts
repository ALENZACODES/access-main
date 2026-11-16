import { describe, expect, it } from "vitest";
import {
  appendLedgerEvent, emptyRecoveryLedger, reconcileLedger,
  recoveryLedgerCopy, summarizeLedger, validLedger,
  type LedgerAction, type LedgerOutcome, type LedgerRequest,
  type RecoveryLedger,
} from "./recoveryLedger";
import { planPackRepairs } from "./recoveryPolicy";

const request: LedgerRequest = {
  packId: "pack-a", action: "review", outcome: "pending",
  day: "2026-11-15", prior: "unknown", after: "unknown",
};
function add(ledger: RecoveryLedger, value: LedgerRequest): RecoveryLedger {
  const result = appendLedgerEvent(ledger, value);
  if (!result.ok) throw new Error(result.reason);
  return result.ledger;
}

describe("session recovery ledger", () => {
  it("starts empty without claiming previous events", () => {
    expect(emptyRecoveryLedger()).toEqual({ version: 1, nextNumber: 1, events: [], discarded: 0 });
  });

  it("accepts an explicit user review", () => {
    const output = add(emptyRecoveryLedger(), request);
    expect(output.events).toEqual([{ ...request, number: 1 }]);
    expect(output.nextNumber).toBe(2);
    expect(output.discarded).toBe(0);
  });

  it("does not mutate the previous ledger", () => {
    const original = Object.freeze(emptyRecoveryLedger());
    const changed = add(original, request);
    expect(original.events).toHaveLength(0);
    expect(changed.events).toHaveLength(1);
  });

  it("rejects duplicate consecutive review events", () => {
    const first = add(emptyRecoveryLedger(), request);
    expect(appendLedgerEvent(first, request)).toEqual({ ok: false, reason: "duplicate" });
  });

  it("accepts events for different packs on the same day", () => {
    const first = add(emptyRecoveryLedger(), request);
    const second = add(first, { ...request, packId: "pack-b" });
    expect(second.events.map((item) => item.packId)).toEqual(["pack-a", "pack-b"]);
  });

  it("accepts changed outcomes for the same pack", () => {
    const first = add(emptyRecoveryLedger(), request);
    const second = add(first, { ...request, outcome: "failed" });
    expect(second.events.map((item) => item.outcome)).toEqual(["pending", "failed"]);
  });

  it.each(["", "../private", "/absolute", "a/b", "a\\b", "a b"])(
    "blocks invalid pack ID %s", (packId) => {
      const result = appendLedgerEvent(emptyRecoveryLedger(), { ...request, packId });
      expect(result).toEqual({ ok: false, reason: "invalid" });
    },
  );

  it.each(["", "2026-11-31", "2026-02-29", "2026/11/15", "today"])(
    "blocks invalid calendar date %s", (day) => {
      expect(appendLedgerEvent(emptyRecoveryLedger(), { ...request, day })).toEqual({
        ok: false, reason: "invalid",
      });
    },
  );

  it("never declares a completed download just because one was requested", () => {
    expect(appendLedgerEvent(emptyRecoveryLedger(), {
      ...request, action: "request-download", outcome: "complete",
    })).toEqual({ ok: false, reason: "invalid" });
  });

  it.each(["review", "request-download", "cancel", "dismiss"] as const)(
    "does not permit %s to promote UNKNOWN to ready", (action) => {
      expect(appendLedgerEvent(emptyRecoveryLedger(), {
        ...request, action, outcome: "complete", after: "ready",
      })).toEqual({ ok: false, reason: "invalid" });
    },
  );

  it("requires an actual local inspection before a ready transition", () => {
    expect(appendLedgerEvent(emptyRecoveryLedger(), {
      ...request, action: "inspect", outcome: "complete", after: "ready",
    }).ok).toBe(true);
    expect(appendLedgerEvent(emptyRecoveryLedger(), {
      ...request, action: "inspect", outcome: "pending", after: "ready",
    }).ok).toBe(false);
  });

  it("counts outcomes without changing stored event states", () => {
    let ledger = emptyRecoveryLedger();
    ledger = add(ledger, request);
    ledger = add(ledger, { ...request, action: "request-download" });
    ledger = add(ledger, { ...request, action: "inspect", outcome: "unknown" });
    ledger = add(ledger, { ...request, action: "cancel", outcome: "failed" });
    const summary = summarizeLedger(ledger);
    expect(summary.eventCount).toBe(4);
    expect(summary.requestedCount).toBe(1);
    expect(summary.unknownCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.lastByPack.get("pack-a")?.action).toBe("cancel");
  });

  it("caps old events and records the number omitted", () => {
    let ledger = emptyRecoveryLedger();
    for (let i = 0; i < 200; i++) {
      ledger = add(ledger, { ...request, packId: `pack-${i}` });
    }
    expect(ledger.events).toHaveLength(160);
    expect(ledger.discarded).toBe(40);
    expect(ledger.nextNumber).toBe(201);
    expect(ledger.events[0]?.number).toBe(41);
    expect(validLedger(ledger)).toBe(true);
  });

  it("rejects sequence exhaustion", () => {
    const ledger: RecoveryLedger = { version: 1, nextNumber: 1_000_001, events: [], discarded: 0 };
    expect(appendLedgerEvent(ledger, request)).toEqual({ ok: false, reason: "limit" });
  });

  it("rejects out-of-sequence imported entries", () => {
    const first = add(emptyRecoveryLedger(), request);
    expect(validLedger({ ...first, events: [{ ...first.events[0]!, number: 2 }] })).toBe(false);
  });

  it("rejects a duplicate numeric event key", () => {
    const first = add(emptyRecoveryLedger(), request);
    expect(validLedger({ ...first, events: [...first.events, first.events[0]!] })).toBe(false);
  });

  it("rejects an invalid event action", () => {
    const first = add(emptyRecoveryLedger(), request);
    const invalid = {
      ...first,
      events: [{ ...first.events[0]!, action: "hidden-action" as LedgerAction }],
    };
    expect(validLedger(invalid)).toBe(false);
  });

  it("rejects an invalid event outcome", () => {
    const first = add(emptyRecoveryLedger(), request);
    expect(validLedger({
      ...first, events: [{ ...first.events[0]!, outcome: "hidden" as LedgerOutcome }],
    })).toBe(false);
  });

  it.each([null, undefined, "text", 1, [], {}])(
    "rejects malformed imported history %s", (value) => {
      expect(validLedger(value)).toBe(false);
    },
  );

  it("rejects negative omitted counts", () => {
    expect(validLedger({ ...emptyRecoveryLedger(), discarded: -1 })).toBe(false);
  });

  it("rejects a future event number", () => {
    const ledger = add(emptyRecoveryLedger(), request);
    expect(validLedger({ ...ledger, nextNumber: 1 })).toBe(false);
  });

  it("reconciles a newly damaged pack without claiming ready", () => {
    let ledger = emptyRecoveryLedger();
    ledger = add(ledger, {
      ...request, action: "inspect", outcome: "complete", prior: "unknown", after: "ready",
    });
    const policy = planPackRepairs([
      { id: "pack-a", state: "corrupt" },
    ], { date: "2026-11-15" });
    const updated = reconcileLedger(ledger, policy.recommendations, "2026-11-15");
    expect(updated.events.at(-1)?.after).toBe("corrupt");
    expect(updated.events.at(-1)?.outcome).toBe("unknown");
  });

  it("does not replace bad records with a successful observation", () => {
    const ledger = add(emptyRecoveryLedger(), request);
    const policy = planPackRepairs([
      { id: "pack-a", state: "unknown" },
    ], { date: "2026-11-15" });
    const updated = reconcileLedger(ledger, policy.recommendations, "2026-11-15");
    expect(updated.events).toHaveLength(1);
  });

  it("refuses invalid reconciliation dates", () => {
    const ledger = add(emptyRecoveryLedger(), request);
    expect(reconcileLedger(ledger, [], "tomorrow")).toEqual(emptyRecoveryLedger());
  });

  it("provides translated action, status and privacy strings", () => {
    const en = recoveryLedgerCopy("en");
    const fr = recoveryLedgerCopy("fr");
    for (const action of ["review", "request-download", "cancel", "inspect", "dismiss"] as const) {
      expect(en.actions[action].length).toBeGreaterThan(3);
      expect(fr.actions[action].length).toBeGreaterThan(3);
      expect(en.actions[action]).not.toBe(fr.actions[action]);
    }
    for (const status of ["pending", "complete", "failed", "unknown"] as const) {
      expect(en.outcomes[status].length).toBeGreaterThan(2);
      expect(fr.outcomes[status].length).toBeGreaterThan(2);
    }
    expect(fr.explanation).toContain("Aucun");
  });
});
