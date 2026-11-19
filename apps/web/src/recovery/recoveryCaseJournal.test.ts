import { describe, expect, it } from "vitest";
import {
  appendCaseEvent,
  caseCounts,
  caseViewCopy,
  changeCasePhase,
  currentPackOutcome,
  effectiveCaseOutcome,
  evidenceFromSource,
  newCaseDocument,
  parseCaseDocument,
  serializeCaseDocument,
  startCase,
  validCalendarDay,
  validCaseEvidence,
  validCaseEvent,
  validCaseId,
  validInstant,
  validateCaseDocument,
  validateRecoveryCase,
  type CaseDocument,
  type CaseEvent,
} from "./recoveryCaseJournal";
import type { LocalPackRecord } from "./packInventory";

const START = "2026-11-18T12:00:00.000Z";
const LATER = "2026-11-18T12:01:00.000Z";
const LAST = "2026-11-18T12:02:00.000Z";
const metadata = { source: "Public dataset", licence: "CC-BY-4.0", date: "2026-11-17", tier: "source-reported" };

function document(): CaseDocument {
  const created = newCaseDocument(START);
  if (!created.ok) throw new Error("test setup");
  return created.value;
}
function withCase(): CaseDocument {
  const result = startCase(document(), "case-1", "pack-1", LATER);
  if (!result.ok) throw new Error("test setup");
  return result.value;
}
function event(overrides: Partial<CaseEvent> = {}): CaseEvent {
  return { id: "event-1", caseId: "case-1", kind: "review", outcome: "unknown", at: LAST,
    note: "Manual inspection", evidence: metadata, ...overrides };
}
function pack(state: LocalPackRecord["state"]): LocalPackRecord {
  return { id: "pack-1", state };
}

describe("case identifiers and dates", () => {
  it.each(["a", "a-1", "region_1", "pack.2", "Z".repeat(96)])("accepts safe identifiers", (id: string) => {
    expect(validCaseId(id)).toBe(true);
  });
  it.each(["", ".", "..", "a/b", "a\\b", "a b", "a?b", "a<b", "a\nb", "z".repeat(97)])("rejects unsafe identifiers", (id: string) => {
    expect(validCaseId(id)).toBe(false);
  });
  it.each(["2026-11-17", "2024-02-29", "2000-01-01"])("accepts canonical calendar days", (day: string) => {
    expect(validCalendarDay(day)).toBe(true);
  });
  it.each(["2026-02-29", "2026-11-31", "2026-13-01", "yesterday", "2026-1-1", "", "2024-02-30"])("rejects invalid dates", (day: string) => {
    expect(validCalendarDay(day)).toBe(false);
  });
  it.each([START, LATER, "2024-02-29T00:00:00Z"])("accepts UTC timestamps", (value: string) => {
    expect(validInstant(value)).toBe(true);
  });
  it.each(["", "2026-11-18", "2026-11-18T12:00:00+00:00", "no", "2026-99-99T12:00:00Z", "2026-02-29T12:00:00Z"])("rejects unsupported timestamps", (value: string) => {
    expect(validInstant(value)).toBe(false);
  });
});

describe("explicit source metadata", () => {
  it("accepts an open licence, date, source and tier", () => {
    expect(validCaseEvidence(metadata)).toBe(true);
  });
  it.each(["source", "licence", "date", "tier"])("requires %s", (key: string) => {
    expect(validCaseEvidence({ ...metadata, [key]: "" })).toBe(false);
  });
  it("rejects unknown licences rather than inventing their permissions", () => {
    expect(validCaseEvidence({ ...metadata, licence: "custom" })).toBe(false);
  });
  it("rejects control characters and markup in source text", () => {
    expect(validCaseEvidence({ ...metadata, source: "one\ntwo" })).toBe(false);
    expect(validCaseEvidence({ ...metadata, tier: "<script>" })).toBe(false);
  });
  it("only constructs metadata from supplied values", () => {
    expect(evidenceFromSource({ name: "Public dataset", licence: "CC-BY-4.0", date: "2026-11-17" }, "source-reported")).toEqual(metadata);
    expect(evidenceFromSource({ name: "Public dataset", licence: "unknown", date: "2026-11-17" }, "source-reported")).toBeNull();
  });
  it("rejects unexpected metadata properties", () => {
    expect(validCaseEvidence({ ...metadata, claimedAccess: true })).toBe(false);
  });
});

describe("journal lifecycle", () => {
  it("creates a bounded empty session document", () => {
    expect(document()).toEqual({ format: "local-recovery-cases", version: 1, createdAt: START, cases: [] });
  });
  it("starts a case without implying any download", () => {
    const result = startCase(document(), "case-1", "pack-1", LATER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.createdAt).toBe(LATER);
      expect(result.value.cases[0]?.phase).toBe("open");
      expect(result.value.cases[0]?.events).toEqual([]);
    }
  });
  it("rejects duplicate case identifiers", () => {
    expect(startCase(withCase(), "case-1", "pack-2", LAST)).toEqual({ ok: false, issue: "duplicate-id" });
  });
  it("rejects a case older than the current document snapshot", () => {
    expect(startCase(withCase(), "case-2", "pack-2", START)).toEqual({ ok: false, issue: "invalid-date" });
  });
  it("appends a manually entered event without changing the pack", () => {
    const result = appendCaseEvent(withCase(), "case-1", event());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.createdAt).toBe(LAST);
      expect(result.value.cases[0]?.events).toEqual([event()]);
      expect(result.value.cases[0]?.packId).toBe("pack-1");
    }
  });
  it("rejects duplicate event identifiers", () => {
    const first = appendCaseEvent(withCase(), "case-1", event());
    if (!first.ok) throw new Error("test setup");
    expect(appendCaseEvent(first.value, "case-1", event())).toEqual({ ok: false, issue: "duplicate-id" });
  });
  it("rejects event timestamps predating the case", () => {
    expect(appendCaseEvent(withCase(), "case-1", event({ at: START }))).toEqual({ ok: false, issue: "invalid-date" });
  });
  it("rejects wrong case references", () => {
    expect(appendCaseEvent(withCase(), "case-1", event({ caseId: "case-2" }))).toEqual({ ok: false, issue: "invalid-event" });
  });
  it("rejects unsafe event note characters", () => {
    expect(validCaseEvent(event({ note: "a\nb" }))).toBe(false);
    expect(validCaseEvent(event({ note: "<p>" }))).toBe(false);
  });
  it("requires source metadata for a completed step", () => {
    expect(validCaseEvent(event({ outcome: "complete", evidence: null }))).toBe(false);
  });
  it("rejects source evidence dated after the event", () => {
    expect(validCaseEvent(event({ evidence: { ...metadata, date: "2026-11-19" } }))).toBe(false);
  });
  it("accepts manual events without source metadata as missing evidence", () => {
    expect(validCaseEvent(event({ evidence: null }))).toBe(true);
  });
  it("can pause and resume an open case", () => {
    const paused = changeCasePhase(withCase(), "case-1", "paused");
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(appendCaseEvent(paused.value, "case-1", event())).toEqual({ ok: false, issue: "invalid-transition" });
    const reopened = changeCasePhase(paused.value, "case-1", "open");
    expect(reopened.ok).toBe(true);
  });
  it("never reopens a closed case", () => {
    const closed = changeCasePhase(withCase(), "case-1", "closed");
    if (!closed.ok) throw new Error("test setup");
    expect(changeCasePhase(closed.value, "case-1", "open")).toEqual({ ok: false, issue: "invalid-transition" });
    expect(appendCaseEvent(closed.value, "case-1", event())).toEqual({ ok: false, issue: "invalid-transition" });
  });
  it("rejects repeated no-op phase changes", () => {
    expect(changeCasePhase(withCase(), "case-1", "open")).toEqual({ ok: false, issue: "invalid-transition" });
  });
});

describe("strict JSON import and export", () => {
  it("round trips a document", () => {
    const original = withCase();
    const encoded = serializeCaseDocument(original);
    expect(encoded.ok).toBe(true);
    if (encoded.ok) expect(parseCaseDocument(encoded.value)).toEqual({ ok: true, value: original });
  });
  it("rejects malformed JSON", () => {
    expect(parseCaseDocument("{")).toEqual({ ok: false, issue: "invalid-document" });
  });
  it("rejects extra top-level properties", () => {
    expect(validateCaseDocument({ ...document(), promoted: true })).toEqual({ ok: false, issue: "invalid-document" });
  });
  it("rejects unsupported versions", () => {
    expect(validateCaseDocument({ ...document(), version: 2 })).toEqual({ ok: false, issue: "unsupported-version" });
  });
  it("rejects duplicate cases on import", () => {
    const entry = withCase().cases[0];
    expect(validateCaseDocument({ ...withCase(), cases: [entry, entry] })).toEqual({ ok: false, issue: "duplicate-id" });
  });
  it("rejects wrong event ordering on import", () => {
    const entry = withCase().cases[0];
    expect(validateRecoveryCase({ ...entry, events: [event(), event({ id: "event-2", at: LATER })] })).toEqual({ ok: false, issue: "invalid-date" });
  });
  it("rejects extremely large documents before JSON parsing", () => {
    expect(parseCaseDocument("x".repeat(400_000))).toEqual({ ok: false, issue: "too-large" });
  });
  it("rejects a document with future-starting cases relative to its snapshot", () => {
    expect(validateCaseDocument({ ...withCase(), createdAt: START })).toEqual({ ok: false, issue: "invalid-date" });
  });
  it("does not accept unexplained extra event fields", () => {
    expect(validCaseEvent({ ...event(), accessible: true })).toBe(false);
  });
});

describe("UNKNOWN is not promoted by historical claims", () => {
  it.each(["unknown", "corrupt", "absent", "ready"] as const)("maps current state %s conservatively", (state: LocalPackRecord["state"]) => {
    expect(currentPackOutcome(pack(state))).toBe(({ unknown: "unknown", corrupt: "failed", absent: "incomplete", ready: "complete" } as const)[state]);
  });
  it("keeps missing records unknown", () => {
    expect(currentPackOutcome(undefined)).toBe("unknown");
  });
  it("does not promote an unavailable pack from an old completed event", () => {
    const result = appendCaseEvent(withCase(), "case-1", event({ outcome: "complete" }));
    if (!result.ok) throw new Error("test setup");
    const entry = result.value.cases[0];
    if (!entry) throw new Error("test setup");
    expect(effectiveCaseOutcome(entry, undefined)).toBe("unknown");
    expect(effectiveCaseOutcome(entry, pack("unknown"))).toBe("unknown");
    expect(effectiveCaseOutcome(entry, pack("corrupt"))).toBe("failed");
  });
  it("does not present an unrecorded ready pack as a completed event", () => {
    const entry = withCase().cases[0];
    if (!entry) throw new Error("test setup");
    expect(effectiveCaseOutcome(entry, pack("ready"))).toBe("unknown");
  });
  it("counts current local status, not only journal claims", () => {
    const result = caseCounts(withCase(), [pack("unknown")]);
    expect(result).toMatchObject({ total: 1, open: 1, unknown: 1, complete: 0 });
  });
});

describe("bilingual copy and safety", () => {
  it("has each field in both languages", () => {
    const en = caseViewCopy("en");
    const fr = caseViewCopy("fr");
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(fr[key]).toBeDefined();
      expect(en[key]).toBeDefined();
    }
  });
  it("presents unknown explicitly in each language", () => {
    expect(caseViewCopy("en").unknown).toBe("UNKNOWN");
    expect(caseViewCopy("fr").unknown).toBe("INCONNU");
  });
  it("does not use unapproved user-facing claims", () => {
    for (const locale of ["en", "fr"] as const) {
      const serialized = JSON.stringify(caseViewCopy(locale));
      expect(serialized).not.toMatch(/\b(?:real.time|partnership|guarantee)\b/i);
    }
  });
});
