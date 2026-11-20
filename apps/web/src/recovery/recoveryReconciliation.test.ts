import { describe, expect, it } from "vitest";
import {
  RECONCILIATION_ACTIONS, RECONCILIATION_CONDITIONS, RECONCILIATION_DISPOSITIONS,
  RECONCILIATION_LIMITS, RECONCILIATION_OPERATIONS, RECONCILIATION_STATUSES,
  RECONCILIATION_TIERS, addReconciliationCase, addReconciliationEvent,
  addReconciliationObservation, caseCurrentCondition, caseHasContradiction,
  checkReconciliationCase, checkReconciliationDocument, checkReconciliationEvent,
  checkReconciliationObservation, checkReconciliationSource, eventsForCase,
  filterReconciliationCases, mergeReconciliationDocuments, newReconciliationDocument,
  nextReconciliationId, observationsForCase, parseReconciliation,
  previewReconciliationMerge, reconciliationContentReady, reconciliationSummary,
  serializeReconciliation, type ReconciliationCase, type ReconciliationDocument,
  type ReconciliationEvent, type ReconciliationObservation,
} from "./recoveryReconciliation";

const source = {
  name: "Example local inventory", licence: "Example permission",
  retrievedOn: "2026-11-19", tier: "UNKNOWN" as const, reference: "example-local",
};
const openedAt = "2026-11-19T13:00:00.000Z";
const later = "2026-11-19T14:00:00.000Z";
const laterStill = "2026-11-19T15:00:00.000Z";
const makeCase = (id = "case-1", changes: Partial<ReconciliationCase> = {}): ReconciliationCase => ({
  id, packId: "region-a", operation: "pack", status: "open", disposition: "UNKNOWN",
  openedAt, title: "An interrupted local pack", summary: "Manual reproduction only",
  source, ...changes,
});
const makeObservation = (id = "obs-1", changes: Partial<ReconciliationObservation> = {}): ReconciliationObservation => ({
  id, caseId: "case-1", condition: "UNKNOWN", recordedAt: later,
  source, note: "A condition was not established", ...changes,
});
const makeEvent = (id = "evt-1", changes: Partial<ReconciliationEvent> = {}): ReconciliationEvent => ({
  id, caseId: "case-1", action: "noted", at: later,
  note: "Local note", source, ...changes,
});
const document = (
  cases: ReconciliationCase[] = [makeCase()],
  observations: ReconciliationObservation[] = [],
  events: ReconciliationEvent[] = [],
): ReconciliationDocument => ({ ...newReconciliationDocument(), cases, observations, events });

describe("reconciliation document constraints", () => {
  it("starts empty with a stable schema", () => {
    expect(newReconciliationDocument()).toEqual({ schema: "the-app.recovery-reconciliation.v1", cases: [], observations: [], events: [] });
  });
  it("supports all four documented operations", () => {
    expect(RECONCILIATION_OPERATIONS).toEqual(["pack", "download", "export", "handoff"]);
  });
  it("retains UNKNOWN in condition choices", () => {
    expect(RECONCILIATION_CONDITIONS[0]).toBe("UNKNOWN");
  });
  it("retains UNKNOWN in tier choices", () => {
    expect(RECONCILIATION_TIERS[0]).toBe("UNKNOWN");
  });
  it("retains UNKNOWN for dispositions", () => {
    expect(RECONCILIATION_DISPOSITIONS).toContain("UNKNOWN");
  });
  it("provides manual statuses", () => {
    expect(RECONCILIATION_STATUSES).toEqual(["open", "in-review", "deferred", "closed"]);
  });
  it("provides manual review events", () => {
    expect(RECONCILIATION_ACTIONS).toContain("reopened");
  });
  it("caps imports below precache chunk budget", () => {
    expect(RECONCILIATION_LIMITS.bytes).toBeLessThanOrEqual(524288);
  });
  it("rejects a missing source", () => {
    expect(checkReconciliationSource(null)).toMatchObject({ ok: false, issue: "source" });
  });
  it("rejects an empty source name", () => {
    expect(checkReconciliationSource({ ...source, name: "" })).toMatchObject({ ok: false, issue: "source" });
  });
  it("rejects an empty licence", () => {
    expect(checkReconciliationSource({ ...source, licence: " " })).toMatchObject({ ok: false, issue: "source" });
  });
  it("rejects absent reference", () => {
    expect(checkReconciliationSource({ ...source, reference: "" })).toMatchObject({ ok: false, issue: "source" });
  });
  it("rejects non-calendar retrieval dates", () => {
    expect(checkReconciliationSource({ ...source, retrievedOn: "2026-02-30" })).toMatchObject({ ok: false, issue: "date" });
  });
  it("rejects unsupported tiers", () => {
    expect(checkReconciliationSource({ ...source, tier: "official" })).toMatchObject({ ok: false, issue: "source" });
  });
  it("preserves a supplied UNKNOWN tier", () => {
    expect(checkReconciliationSource(source)).toMatchObject({ ok: true, value: source });
  });
  it("rejects unexpected source properties", () => {
    expect(checkReconciliationSource({ ...source, extra: true })).toMatchObject({ ok: false, issue: "source" });
  });
  it("rejects a malformed case id", () => {
    expect(checkReconciliationCase(makeCase("two words"))).toMatchObject({ ok: false, issue: "id" });
  });
  it("rejects malformed pack identifiers", () => {
    expect(checkReconciliationCase(makeCase("case-1", { packId: "../secret" }))).toMatchObject({ ok: false, issue: "id" });
  });
  it("rejects empty case titles", () => {
    expect(checkReconciliationCase(makeCase("case-1", { title: "  " }))).toMatchObject({ ok: false, issue: "text" });
  });
  it("rejects bad case timestamps", () => {
    expect(checkReconciliationCase(makeCase("case-1", { openedAt: "yesterday" }))).toMatchObject({ ok: false, issue: "time" });
  });
  it("rejects unsupported operations", () => {
    expect(checkReconciliationCase({ ...makeCase(), operation: "delete" })).toMatchObject({ ok: false, issue: "format" });
  });
  it("accepts a valid case", () => {
    expect(checkReconciliationCase(makeCase()).ok).toBe(true);
  });
  it("rejects unexpected case fields", () => {
    expect(checkReconciliationCase({ ...makeCase(), authorized: true })).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects control characters in notes", () => {
    expect(checkReconciliationObservation(makeObservation("obs-1", { note: "bad" + String.fromCharCode(0) }))).toMatchObject({ ok: false, issue: "text" });
  });
  it("allows line breaks in notes", () => {
    expect(checkReconciliationObservation(makeObservation("obs-1", { note: "first\nsecond" })).ok).toBe(true);
  });
  it("rejects unsupported observation conditions", () => {
    expect(checkReconciliationObservation({ ...makeObservation(), condition: "ready" })).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects bad observation dates", () => {
    expect(checkReconciliationObservation(makeObservation("obs-1", { recordedAt: "2026-11-19" }))).toMatchObject({ ok: false, issue: "time" });
  });
  it("accepts a valid observation", () => {
    expect(checkReconciliationObservation(makeObservation()).ok).toBe(true);
  });
  it("rejects unsupported events", () => {
    expect(checkReconciliationEvent({ ...makeEvent(), action: "delete" })).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects invalid event references", () => {
    expect(checkReconciliationEvent(makeEvent("evt-1", { caseId: "bad id" }))).toMatchObject({ ok: false, issue: "id" });
  });
  it("accepts a valid manual event", () => {
    expect(checkReconciliationEvent(makeEvent()).ok).toBe(true);
  });
  it("rejects a missing schema", () => {
    expect(checkReconciliationDocument({ cases: [], observations: [], events: [] })).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects a different schema version", () => {
    expect(checkReconciliationDocument({ ...newReconciliationDocument(), schema: "v2" })).toMatchObject({ ok: false, issue: "version" });
  });
  it("rejects array types in place of document", () => {
    expect(checkReconciliationDocument([])).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects extra document fields", () => {
    expect(checkReconciliationDocument({ ...newReconciliationDocument(), secret: true })).toMatchObject({ ok: false, issue: "format" });
  });
  it("rejects duplicate cases", () => {
    expect(checkReconciliationDocument(document([makeCase(), makeCase()]))).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("rejects duplicate observations", () => {
    expect(checkReconciliationDocument(document([makeCase()], [makeObservation(), makeObservation()]))).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("rejects duplicate events", () => {
    expect(checkReconciliationDocument(document([makeCase()], [], [makeEvent(), makeEvent()]))).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("rejects orphan observations", () => {
    expect(checkReconciliationDocument(document([], [makeObservation()]))).toMatchObject({ ok: false, issue: "reference" });
  });
  it("rejects orphan activity", () => {
    expect(checkReconciliationDocument(document([], [], [makeEvent()]))).toMatchObject({ ok: false, issue: "reference" });
  });
  it("rejects observations dated before the case", () => {
    expect(checkReconciliationDocument(document([makeCase()], [makeObservation("obs-1", { recordedAt: "2026-11-18T12:00:00.000Z" })]))).toMatchObject({ ok: false, issue: "time" });
  });
  it("rejects activity dated before the case", () => {
    expect(checkReconciliationDocument(document([makeCase()], [], [makeEvent("evt-1", { at: "2026-11-18T12:00:00.000Z" })]))).toMatchObject({ ok: false, issue: "time" });
  });
  it("accepts an empty document", () => {
    expect(checkReconciliationDocument(newReconciliationDocument()).ok).toBe(true);
  });
  it("accepts cases with observations and events", () => {
    expect(checkReconciliationDocument(document([makeCase()], [makeObservation()], [makeEvent()])).ok).toBe(true);
  });
  it("rejects oversized serialized JSON", () => {
    expect(parseReconciliation("a".repeat(RECONCILIATION_LIMITS.bytes + 1))).toMatchObject({ ok: false, issue: "size" });
  });
  it("rejects malformed JSON", () => {
    expect(parseReconciliation("{" )).toMatchObject({ ok: false, issue: "format" });
  });
  it("roundtrips valid JSON", () => {
    const original = document([makeCase()], [makeObservation()], [makeEvent()]);
    const encoded = serializeReconciliation(original);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(parseReconciliation(encoded.value)).toEqual({ ok: true, value: original });
  });
  it("serializes in stable identifier order", () => {
    const input = document([makeCase("case-2"), makeCase("case-1")]);
    const encoded = serializeReconciliation(input);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.value.indexOf('"case-1"')).toBeLessThan(encoded.value.indexOf('"case-2"'));
  });
});

describe("manual changes and fail-closed transitions", () => {
  it("allocates the first case id", () => {
    expect(nextReconciliationId(newReconciliationDocument(), "case")).toBe("case-1");
  });
  it("avoids existing identifiers", () => {
    expect(nextReconciliationId(document(), "case")).toBe("case-2");
  });
  it("allocates observation ids independently", () => {
    expect(nextReconciliationId(document(), "obs")).toBe("obs-1");
  });
  it("allocates activity ids independently", () => {
    expect(nextReconciliationId(document(), "evt")).toBe("evt-1");
  });
  it("adds valid cases", () => {
    const r = addReconciliationCase(newReconciliationDocument(), makeCase());
    expect(r.ok && r.value.cases.length).toBe(1);
  });
  it("does not duplicate existing cases", () => {
    expect(addReconciliationCase(document(), makeCase())).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("adds an observation to a known case", () => {
    const r = addReconciliationObservation(document(), makeObservation());
    expect(r.ok && r.value.observations.length).toBe(1);
  });
  it("refuses an observation without a case", () => {
    expect(addReconciliationObservation(newReconciliationDocument(), makeObservation())).toMatchObject({ ok: false, issue: "reference" });
  });
  it("refuses a duplicate observation", () => {
    expect(addReconciliationObservation(document([makeCase()], [makeObservation()]), makeObservation())).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("adds a note without changing case status", () => {
    const r = addReconciliationEvent(document(), makeEvent());
    expect(r.ok && r.value.cases[0]?.status).toBe("open");
  });
  it("can request review from an open case", () => {
    const r = addReconciliationEvent(document(), makeEvent("evt-1", { action: "reviewed" }));
    expect(r.ok && r.value.cases[0]?.status).toBe("in-review");
  });
  it("can defer an open case", () => {
    const r = addReconciliationEvent(document(), makeEvent("evt-1", { action: "deferred" }));
    expect(r.ok && r.value.cases[0]?.status).toBe("deferred");
  });
  it("can defer a review case", () => {
    const r = addReconciliationEvent(document([makeCase("case-1", { status: "in-review" })]), makeEvent("evt-1", { action: "deferred" }));
    expect(r.ok && r.value.cases[0]?.status).toBe("deferred");
  });
  it("can resume review from deferred", () => {
    const r = addReconciliationEvent(document([makeCase("case-1", { status: "deferred" })]), makeEvent("evt-1", { action: "reviewed" }));
    expect(r.ok && r.value.cases[0]?.status).toBe("in-review");
  });
  it("refuses to close without explicit disposition", () => {
    expect(addReconciliationEvent(document(), makeEvent("evt-1", { action: "closed" }))).toMatchObject({ ok: false, issue: "transition" });
  });
  it("refuses to close with UNKNOWN disposition", () => {
    expect(addReconciliationEvent(document(), makeEvent("evt-1", { action: "closed" }), "UNKNOWN")).toMatchObject({ ok: false, issue: "transition" });
  });
  it("can document closure with a limited disposition", () => {
    const r = addReconciliationEvent(document(), makeEvent("evt-1", { action: "closed" }), "seek-source");
    expect(r.ok && r.value.cases[0]).toMatchObject({ status: "closed", disposition: "seek-source" });
  });
  it("cannot change disposition for a note", () => {
    expect(addReconciliationEvent(document(), makeEvent(), "retain")).toMatchObject({ ok: false, issue: "transition" });
  });
  it("refuses to reopen an open case", () => {
    expect(addReconciliationEvent(document(), makeEvent("evt-1", { action: "reopened" }))).toMatchObject({ ok: false, issue: "transition" });
  });
  it("allows a closed case to be reopened", () => {
    const base = document([makeCase("case-1", { status: "closed", disposition: "document-only" })]);
    const r = addReconciliationEvent(base, makeEvent("evt-1", { action: "reopened" }));
    expect(r.ok && r.value.cases[0]?.status).toBe("open");
  });
  it("blocks notes after case closure", () => {
    const base = document([makeCase("case-1", { status: "closed", disposition: "document-only" })]);
    expect(addReconciliationEvent(base, makeEvent())).toMatchObject({ ok: false, issue: "transition" });
  });
  it("rejects events for missing cases", () => {
    expect(addReconciliationEvent(document(), makeEvent("evt-1", { caseId: "case-2" }))).toMatchObject({ ok: false, issue: "reference" });
  });
  it("rejects events before opening", () => {
    expect(addReconciliationEvent(document(), makeEvent("evt-1", { at: "2026-11-18T00:00:00.000Z" }))).toMatchObject({ ok: false, issue: "time" });
  });
  it("does not allow an explicit opened event after creation", () => {
    expect(addReconciliationEvent(document(), makeEvent("evt-1", { action: "opened" }))).toMatchObject({ ok: false, issue: "transition" });
  });
  it("returns observations in time order", () => {
    const d = document([makeCase()], [makeObservation("obs-2", { recordedAt: laterStill }), makeObservation()]);
    expect(observationsForCase(d, "case-1").map((o) => o.id)).toEqual(["obs-1", "obs-2"]);
  });
  it("returns activity in time order", () => {
    const d = document([makeCase()], [], [makeEvent("evt-2", { at: laterStill }), makeEvent()]);
    expect(eventsForCase(d, "case-1").map((e) => e.id)).toEqual(["evt-1", "evt-2"]);
  });
  it("does not leak another case's observations", () => {
    const d = document([makeCase(), makeCase("case-2")], [makeObservation(), makeObservation("obs-2", { caseId: "case-2" })]);
    expect(observationsForCase(d, "case-1")).toHaveLength(1);
  });
  it("does not leak another case's activity", () => {
    const d = document([makeCase(), makeCase("case-2")], [], [makeEvent(), makeEvent("evt-2", { caseId: "case-2" })]);
    expect(eventsForCase(d, "case-2")).toHaveLength(1);
  });
  it("leaves an unobserved case UNKNOWN", () => {
    expect(caseCurrentCondition(document(), "case-1")).toBe("UNKNOWN");
  });
  it("preserves explicit UNKNOWN observations", () => {
    expect(caseCurrentCondition(document([makeCase()], [makeObservation()]), "case-1")).toBe("UNKNOWN");
  });
  it("uses a single observed condition", () => {
    const d = document([makeCase()], [makeObservation("obs-1", { condition: "interrupted" })]);
    expect(caseCurrentCondition(d, "case-1")).toBe("interrupted");
  });
  it("detects divergent observed conditions", () => {
    const d = document([makeCase()], [makeObservation(), makeObservation("obs-2", { condition: "unavailable" })]);
    expect(caseHasContradiction(d, "case-1")).toBe(true);
    expect(caseCurrentCondition(d, "case-1")).toBe("UNKNOWN");
  });
  it("does not treat repeated identical observations as contradictions", () => {
    const d = document([makeCase()], [makeObservation(), makeObservation("obs-2")]);
    expect(caseHasContradiction(d, "case-1")).toBe(false);
  });
  it("does not authorize a pack with any case status", () => {
    for (const status of RECONCILIATION_STATUSES) {
      expect(reconciliationContentReady(document([makeCase("case-1", { status })]))).toBe(false);
    }
  });
});

describe("query, summary, import reconciliation", () => {
  const base = document([makeCase(), makeCase("case-2", { packId: "region-b", operation: "handoff", status: "closed", disposition: "retain", title: "Handoff" })], [makeObservation()]);
  it("counts cases", () => { expect(reconciliationSummary(base).cases).toBe(2); });
  it("counts pack identifiers", () => { expect(reconciliationSummary(base).packs).toBe(2); });
  it("counts pending cases", () => { expect(reconciliationSummary(base).open).toBe(1); });
  it("counts closed records", () => { expect(reconciliationSummary(base).closed).toBe(1); });
  it("counts UNKNOWN conditions", () => { expect(reconciliationSummary(base).unknown).toBe(2); });
  it("never reports content ready", () => { expect(reconciliationSummary(base).contentReady).toBe(false); });
  it("filters by pack", () => { expect(filterReconciliationCases(base, { packId: "region-b" }).map((c) => c.id)).toEqual(["case-2"]); });
  it("filters by operation", () => { expect(filterReconciliationCases(base, { operation: "handoff" })).toHaveLength(1); });
  it("filters by status", () => { expect(filterReconciliationCases(base, { status: "open" })).toHaveLength(1); });
  it("filters by disposition", () => { expect(filterReconciliationCases(base, { disposition: "retain" })).toHaveLength(1); });
  it("filters case titles ignoring case", () => { expect(filterReconciliationCases(base, { query: "HANDOFF" })).toHaveLength(1); });
  it("does not find unrelated titles", () => { expect(filterReconciliationCases(base, { query: "unmatched" })).toHaveLength(0); });
  it("filters by source names", () => { expect(filterReconciliationCases(base, { query: "local inventory" })).toHaveLength(2); });
  it("filters contradictory observations", () => {
    const d = document([makeCase()], [makeObservation(), makeObservation("obs-2", { condition: "interrupted" })]);
    expect(filterReconciliationCases(d, { conflictingOnly: true })).toHaveLength(1);
  });
  it("does not label an unobserved case a conflict", () => {
    expect(filterReconciliationCases(base, { conflictingOnly: true })).toHaveLength(0);
  });
  it("previews a new case", () => {
    expect(previewReconciliationMerge(document(), base).newCases).toBe(1);
  });
  it("previews matching case ids", () => {
    expect(previewReconciliationMerge(base, base).overlappingCases).toBe(2);
  });
  it("previews matching observations", () => {
    expect(previewReconciliationMerge(base, base).newObservations).toBe(0);
  });
  it("rejects divergent matching cases", () => {
    const other = document([makeCase("case-1", { title: "Changed" })]);
    expect(previewReconciliationMerge(base, other).conflictingCases).toBe(1);
    expect(mergeReconciliationDocuments(base, other)).toMatchObject({ ok: false, issue: "conflict" });
  });
  it("rejects divergent matching observation ids", () => {
    const other = document([makeCase()], [makeObservation("obs-1", { note: "Different" })]);
    expect(previewReconciliationMerge(base, other).conflictingObservations).toBe(1);
  });
  it("rejects divergent matching event ids", () => {
    const left = document([makeCase()], [], [makeEvent()]);
    const right = document([makeCase()], [], [makeEvent("evt-1", { note: "Different" })]);
    expect(previewReconciliationMerge(left, right).conflictingEvents).toBe(1);
  });
  it("allows an identical merge", () => {
    const result = mergeReconciliationDocuments(base, base);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.value).toEqual(base);
  });
  it("allows distinct case identifiers", () => {
    const incoming = document([makeCase("case-3", { packId: "region-c" })]);
    const result = mergeReconciliationDocuments(base, incoming);
    expect(result.ok && result.value.cases.length).toBe(3);
  });
  it("does not mutate either merge input", () => {
    const first = JSON.stringify(base);
    const incoming = document([makeCase("case-3", { packId: "region-c" })]);
    const second = JSON.stringify(incoming);
    mergeReconciliationDocuments(base, incoming);
    expect(JSON.stringify(base)).toBe(first);
    expect(JSON.stringify(incoming)).toBe(second);
  });
  it("rejects invalid incoming documents", () => {
    const invalid = { ...base, cases: [makeCase(), makeCase()] };
    expect(mergeReconciliationDocuments(base, invalid)).toMatchObject({ ok: false, issue: "duplicate" });
  });
  it("does not silently change case disposition in a merge", () => {
    const incoming = document([makeCase("case-1", { disposition: "seek-source" })]);
    expect(mergeReconciliationDocuments(base, incoming)).toMatchObject({ ok: false, issue: "conflict" });
  });
});
