import { describe, expect, it } from "vitest";
import {
  HANDOFF_LIMITS, HANDOFF_OPERATIONS, HANDOFF_CONDITIONS, HANDOFF_DECISIONS,
  appendHandoffCase, appendHandoffEvent, currentHandoffDecision,
  exportHandoffDocument, handoffSummary, mergeHandoffDocuments,
  newHandoffDocument, parseHandoffDocument, validateHandoffCase,
  validateHandoffDocument, validateHandoffEvent,
  type HandoffCase, type HandoffEvent,
} from "./recoveryHandoff";

const base: HandoffCase = {
  id: "handoff-1", packId: "region-1", operation: "pack", condition: "UNKNOWN",
  openedAt: "2026-11-19T09:00:00.000Z", summary: "Manual inspection needed",
  source: { name: "Open source", licence: "CC0-1.0", date: "2026-11-19", tier: "UNKNOWN", reference: "" },
  events: [],
};
const later = (decision: HandoffEvent["decision"], id = "event-1"): HandoffEvent => ({
  id, at: "2026-11-19T09:30:00.000Z", decision, note: "Manual note",
});

describe("cross-operation handoff invariants", () => {
  it.each(HANDOFF_OPERATIONS)("does not infer pack status from %s", (operation) => {
    const record = { ...base, operation };
    expect(validateHandoffCase(record)).toBeNull();
    expect(currentHandoffDecision(record)).toBe("UNKNOWN");
  });
  it.each(HANDOFF_CONDITIONS)("preserves condition %s", (condition) => {
    const document = { ...newHandoffDocument(), cases: [{ ...base, condition }] };
    expect(validateHandoffDocument(document).ok).toBe(true);
    const exported = exportHandoffDocument(document);
    expect(exported.ok).toBe(true);
    if (exported.ok) {
      const imported = parseHandoffDocument(exported.value);
      expect(imported.ok).toBe(true);
      if (imported.ok) expect(imported.value.cases[0]?.condition).toBe(condition);
    }
  });
  it.each(HANDOFF_DECISIONS)("keeps manual decision %s separate from pack condition", (decision) => {
    const existing = { ...base, condition: "failed" as const };
    const result = appendHandoffEvent({ ...newHandoffDocument(), cases: [existing] }, existing.id, later(decision));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cases[0]?.condition).toBe("failed");
      expect(currentHandoffDecision(result.value.cases[0]!)).toBe(decision);
    }
  });
  it("rejects unknown decision names in stored histories", () => {
    const invalid = { ...later("review"), decision: "ready" };
    expect(validateHandoffEvent(invalid)).toBe("decision");
  });
  it("rejects records with a non-UTC timestamp", () => {
    const invalid = { ...base, openedAt: "2026-11-19T09:00:00.000-05:00" };
    expect(validateHandoffCase(invalid)).toBe("time");
  });
  it("rejects unsafe event ID traversal", () => {
    expect(validateHandoffEvent({ ...later("review"), id: "../../a" })).toBe("identifier");
  });
  it("rejects unexpected changes to operation type", () => {
    expect(validateHandoffCase({ ...base, operation: "delete-pack" })).toBe("format");
  });
  it("rejects a false boolean reported condition", () => {
    expect(validateHandoffCase({ ...base, condition: true })).toBe("condition");
  });
  it("does not allow an event without its timestamp", () => {
    expect(validateHandoffEvent({ ...later("review"), at: undefined })).toBe("time");
  });
  it("rejects a null event", () => {
    expect(validateHandoffEvent(null)).toBe("format");
  });
  it("rejects duplicate cases during an export", () => {
    const document = { ...newHandoffDocument(), cases: [base, base] };
    expect(exportHandoffDocument(document)).toEqual({ ok: false, issue: "duplicate" });
  });
  it("rejects a repeated field in an imported object through strict structure", () => {
    const entry = { ...base, unexpected: "not part of the format" };
    expect(validateHandoffCase(entry)).toBe("format");
  });
  it("cannot make an UNKNOWN condition eligible for retry simply by review", () => {
    const document = { ...newHandoffDocument(), cases: [base] };
    const reviewed = appendHandoffEvent(document, base.id, later("review"));
    expect(reviewed.ok).toBe(true);
    if (reviewed.ok) {
      const attempted = appendHandoffEvent(reviewed.value, base.id, {
        ...later("retry-requested", "event-2"), at: "2026-11-19T09:31:00.000Z",
      });
      expect(attempted).toEqual({ ok: false, issue: "transition" });
    }
  });
  it("does not allow a closed case to be reopened", () => {
    const document = { ...newHandoffDocument(), cases: [{ ...base, events: [later("closed")] }] };
    const attempted = appendHandoffEvent(document, base.id, {
      ...later("review", "event-2"), at: "2026-11-19T09:31:00.000Z",
    });
    expect(attempted).toEqual({ ok: false, issue: "transition" });
  });
  it("returns unknown counts without fabricating closed work", () => {
    const summary = handoffSummary({ ...newHandoffDocument(), cases: [base] });
    expect(summary.unknown).toBe(1);
    expect(summary.closed).toBe(0);
    expect(summary.pending).toBe(0);
  });
  it("keeps duplicate imports from doubling history", () => {
    const original = { ...newHandoffDocument(), cases: [base] };
    const merged = mergeHandoffDocuments(original, original);
    expect(merged.ok).toBe(true);
    if (merged.ok) expect(merged.value.cases).toHaveLength(1);
  });
  it("checks a full document even when a newly appended entry is valid", () => {
    const invalid = { ...newHandoffDocument(), cases: [{ ...base, summary: "" }] };
    expect(appendHandoffCase(invalid, { ...base, id: "handoff-2" })).toEqual({ ok: false, issue: "text" });
  });
  it("accepts exactly the configured number of event entries", () => {
    const events: HandoffEvent[] = Array.from({ length: HANDOFF_LIMITS.maxEvents }, (_, i) => ({
      id: `event-${i}`, at: `2026-11-19T09:${String(i).padStart(2, "0")}:00.000Z`, decision: "review", note: "",
    }));
    expect(validateHandoffCase({ ...base, events })).toBeNull();
  });
});
