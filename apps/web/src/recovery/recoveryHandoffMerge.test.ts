import { describe, expect, it } from "vitest";
import {
  HANDOFF_LIMITS, appendHandoffCase, appendHandoffEvent, currentHandoffDecision,
  exportHandoffDocument, filterHandoffCases, handoffForPack, handoffSummary,
  handoffUpdatedAt, mergeHandoffDocuments, newHandoffDocument, nextEventId,
  nextHandoffId, parseHandoffDocument, previewHandoffMerge, validateHandoffDocument,
  type HandoffCase, type HandoffDocument, type HandoffEvent,
} from "./recoveryHandoff";

const source = {
  name: "Public record", licence: "CC-BY-4.0", date: "2026-11-18",
  tier: "UNKNOWN" as const, reference: "catalogue-1",
};
function sample(id: string, packId = "region-1", patch: Partial<HandoffCase> = {}): HandoffCase {
  return {
    id, packId, operation: "download", condition: "failed",
    openedAt: "2026-11-19T12:00:00.000Z", summary: "File could not be saved",
    source, events: [], ...patch,
  };
}
function event(id: string, decision: HandoffEvent["decision"], at: string): HandoffEvent {
  return { id, decision, at, note: "Manual record" };
}
function doc(...cases: HandoffCase[]): HandoffDocument {
  return { ...newHandoffDocument(), cases };
}
function unwrap<T>(result: { ok: boolean; value?: T }): T {
  expect(result.ok).toBe(true);
  if (result.value === undefined) throw new Error("No value");
  return result.value;
}

describe("handoff import preview", () => {
  it("reports newly supplied cases", () => {
    const result = unwrap(previewHandoffMerge(doc(sample("one")), doc(sample("two"))));
    expect(result.added).toEqual(["two"]);
    expect(result.unchanged).toEqual([]);
    expect(result.collisions).toEqual([]);
  });
  it("reports exact duplicates without duplicating them", () => {
    const result = unwrap(previewHandoffMerge(doc(sample("one")), doc(sample("one"))));
    expect(result.added).toEqual([]);
    expect(result.unchanged).toEqual(["one"]);
  });
  it("reports ID collisions when the summary differs", () => {
    const result = unwrap(previewHandoffMerge(
      doc(sample("one")), doc(sample("one", "region-1", { summary: "Different issue" })),
    ));
    expect(result.collisions).toEqual(["one"]);
  });
  it("reports ID collisions when source details differ", () => {
    const replacement = sample("one", "region-1", { source: { ...source, name: "Different source" } });
    const result = unwrap(previewHandoffMerge(doc(sample("one")), doc(replacement)));
    expect(result.collisions).toEqual(["one"]);
  });
  it("reports ID collisions when event history differs", () => {
    const changed = sample("one", "region-1", { events: [event("note-1", "review", "2026-11-19T12:01:00.000Z")] });
    const result = unwrap(previewHandoffMerge(doc(sample("one")), doc(changed)));
    expect(result.collisions).toEqual(["one"]);
  });
  it("does not silently merge a conflicting event history", () => {
    const incoming = doc(sample("one", "region-1", { summary: "Different issue" }));
    expect(mergeHandoffDocuments(doc(sample("one")), incoming)).toEqual({ ok: false, issue: "collision" });
  });
  it("appends new cases after existing cases", () => {
    const result = unwrap(mergeHandoffDocuments(doc(sample("one")), doc(sample("two"))));
    expect(result.cases.map((item) => item.id)).toEqual(["one", "two"]);
  });
  it("never overwrites a matching existing case", () => {
    const original = doc(sample("one"));
    const result = unwrap(mergeHandoffDocuments(original, original));
    expect(result.cases).toEqual(original.cases);
  });
  it("does not mutate the receiving document", () => {
    const original = doc(sample("one"));
    mergeHandoffDocuments(original, doc(sample("two")));
    expect(original.cases.map((item) => item.id)).toEqual(["one"]);
  });
  it("does not mutate the imported document", () => {
    const incoming = doc(sample("two"));
    mergeHandoffDocuments(doc(sample("one")), incoming);
    expect(incoming.cases.map((item) => item.id)).toEqual(["two"]);
  });
  it("rejects a malformed receiver", () => {
    const invalid = { ...doc(), format: "unsupported" } as unknown as HandoffDocument;
    expect(previewHandoffMerge(invalid, doc())).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a malformed import", () => {
    const invalid = { ...doc(), format: "unsupported" } as unknown as HandoffDocument;
    expect(previewHandoffMerge(doc(), invalid)).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a combined result above the case count limit", () => {
    const current = doc(...Array.from({ length: HANDOFF_LIMITS.maxCases }, (_, i) => sample(`case-${i}`)));
    expect(previewHandoffMerge(current, doc(sample("extra")))).toEqual({ ok: false, issue: "limit" });
  });
  it("allows a full document when no new cases are added", () => {
    const current = doc(...Array.from({ length: HANDOFF_LIMITS.maxCases }, (_, i) => sample(`case-${i}`)));
    expect(previewHandoffMerge(current, doc(sample("case-1"))).ok).toBe(true);
  });
  it("rejects an imported duplicate identifier", () => {
    const incoming = doc(sample("duplicate"), sample("duplicate"));
    expect(previewHandoffMerge(doc(), incoming)).toEqual({ ok: false, issue: "duplicate" });
  });
  it("preserves imported UNKNOWN conditions", () => {
    const incoming = doc(sample("new", "region-2", { condition: "UNKNOWN" }));
    const result = unwrap(mergeHandoffDocuments(doc(), incoming));
    expect(result.cases[0]?.condition).toBe("UNKNOWN");
    expect(currentHandoffDecision(result.cases[0]!)).toBe("UNKNOWN");
  });
  it("preserves each imported source's licence", () => {
    const incoming = doc(sample("new", "region-2", { source: { ...source, licence: "ODbL-1.0" } }));
    const result = unwrap(mergeHandoffDocuments(doc(), incoming));
    expect(result.cases[0]?.source.licence).toBe("ODbL-1.0");
  });
  it("leaves a previously closed case closed", () => {
    const closed = sample("closed", "region-1", { events: [event("final", "closed", "2026-11-19T12:01:00.000Z")] });
    const result = unwrap(mergeHandoffDocuments(doc(closed), doc(sample("new"))));
    expect(currentHandoffDecision(result.cases[0]!)).toBe("closed");
  });
  it("rejects unsafe text even when it is imported alongside valid cases", () => {
    const incoming = doc(sample("valid"), sample("invalid", "region-1", { summary: "<markup>" }));
    expect(mergeHandoffDocuments(doc(), incoming)).toEqual({ ok: false, issue: "text" });
  });
  it("returns a deterministic merge preview", () => {
    const a = doc(sample("one"));
    const b = doc(sample("one"), sample("two"));
    expect(previewHandoffMerge(a, b)).toEqual(previewHandoffMerge(a, b));
  });
});

describe("portable JSON parsing and export", () => {
  it("accepts a valid empty document", () => {
    const result = parseHandoffDocument(JSON.stringify(doc()));
    expect(result.ok).toBe(true);
  });
  it("round-trips a normal document", () => {
    const original = doc(sample("case-a"), sample("case-b", "region-2"));
    const encoded = unwrap(exportHandoffDocument(original));
    expect(parseHandoffDocument(encoded)).toEqual({ ok: true, value: original });
  });
  it("round-trips Unicode notes", () => {
    const original = doc(sample("case-a", "region-1", { summary: "Données enregistrées localement" }));
    const encoded = unwrap(exportHandoffDocument(original));
    expect(unwrap(parseHandoffDocument(encoded)).cases[0]?.summary).toBe("Données enregistrées localement");
  });
  it("rejects empty input", () => {
    expect(parseHandoffDocument("")).toEqual({ ok: false, issue: "format" });
  });
  it("rejects truncated JSON", () => {
    expect(parseHandoffDocument('{"format":')).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a JSON array", () => {
    expect(parseHandoffDocument("[]")).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a JSON string", () => {
    expect(parseHandoffDocument('"hello"')).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a JSON number", () => {
    expect(parseHandoffDocument("5")).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a JSON null", () => {
    expect(parseHandoffDocument("null")).toEqual({ ok: false, issue: "format" });
  });
  it("rejects an unexpected document field", () => {
    const invalid = { ...doc(), extra: "unexpected" };
    expect(parseHandoffDocument(JSON.stringify(invalid))).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a wrong version", () => {
    const invalid = { ...doc(), version: 2 };
    expect(parseHandoffDocument(JSON.stringify(invalid))).toEqual({ ok: false, issue: "format" });
  });
  it("rejects a missing cases field", () => {
    expect(parseHandoffDocument('{"format":"local-recovery-handoff","version":1}')).toEqual({ ok: false, issue: "format" });
  });
  it("rejects non-array cases", () => {
    const invalid = { ...doc(), cases: {} };
    expect(parseHandoffDocument(JSON.stringify(invalid))).toEqual({ ok: false, issue: "format" });
  });
  it("rejects an oversized byte stream before parsing", () => {
    expect(parseHandoffDocument(" ".repeat(HANDOFF_LIMITS.maxBytes + 1))).toEqual({ ok: false, issue: "limit" });
  });
  it("rejects a huge Unicode document by byte size", () => {
    const raw = "é".repeat(HANDOFF_LIMITS.maxBytes);
    expect(parseHandoffDocument(raw)).toEqual({ ok: false, issue: "limit" });
  });
  it("never substitutes fabricated source information", () => {
    const original = doc(sample("one"));
    const roundtrip = unwrap(parseHandoffDocument(unwrap(exportHandoffDocument(original))));
    expect(roundtrip.cases[0]?.source).toEqual(source);
  });
  it("does not change the reported condition on round-trip", () => {
    const original = doc(sample("one", "region-1", { condition: "UNKNOWN" }));
    const roundtrip = unwrap(parseHandoffDocument(unwrap(exportHandoffDocument(original))));
    expect(roundtrip.cases[0]?.condition).toBe("UNKNOWN");
  });
  it("does not add a decision history during round-trip", () => {
    const roundtrip = unwrap(parseHandoffDocument(unwrap(exportHandoffDocument(doc(sample("one"))))));
    expect(roundtrip.cases[0]?.events).toHaveLength(0);
  });
  it("fails exporting a malformed document", () => {
    const invalid = { ...doc(), version: 99 } as unknown as HandoffDocument;
    expect(exportHandoffDocument(invalid)).toEqual({ ok: false, issue: "format" });
  });
  it("rejects unexpected event fields in imported history", () => {
    const invalid = doc(sample("one", "region-1", { events: [{ ...event("event-1", "review", "2026-11-19T12:01:00.000Z"), hidden: true } as unknown as HandoffEvent] }));
    expect(parseHandoffDocument(JSON.stringify(invalid))).toEqual({ ok: false, issue: "format" });
  });
  it("preserves manual decisions while parsing", () => {
    const original = doc(sample("one", "region-1", { events: [event("event-1", "deferred", "2026-11-19T12:01:00.000Z")] }));
    const roundtrip = unwrap(parseHandoffDocument(unwrap(exportHandoffDocument(original))));
    expect(currentHandoffDecision(roundtrip.cases[0]!)).toBe("deferred");
  });
});

describe("summary, filtering and coverage", () => {
  const reports = doc(
    sample("alpha", "region-1", { operation: "pack", condition: "UNKNOWN" }),
    sample("beta", "region-1", { operation: "download", events: [event("event-b", "review", "2026-11-19T12:01:00.000Z")] }),
    sample("gamma", "region-2", { operation: "export", events: [event("event-c", "closed", "2026-11-19T12:02:00.000Z")] }),
    sample("delta", "region-3", { operation: "storage", events: [event("event-d", "deferred", "2026-11-19T12:03:00.000Z")] }),
  );
  it("counts every case", () => {
    expect(handoffSummary(reports).count).toBe(4);
  });
  it("counts distinct pack IDs", () => {
    expect(handoffSummary(reports).distinctPacks).toBe(3);
  });
  it("counts UNKNOWN decisions", () => {
    expect(handoffSummary(reports).unknown).toBe(1);
  });
  it("counts manually closed cases", () => {
    expect(handoffSummary(reports).closed).toBe(1);
  });
  it("counts pending review and deferral", () => {
    expect(handoffSummary(reports).pending).toBe(2);
  });
  it("reports UNKNOWN for a pack absent from the journal", () => {
    expect(handoffForPack(reports, "not-listed").decision).toBe("UNKNOWN");
  });
  it("does not imply an absent pack is complete", () => {
    expect(handoffForPack(reports, "not-listed").count).toBe(0);
  });
  it("reports the total count for an existing pack", () => {
    expect(handoffForPack(reports, "region-1").count).toBe(2);
  });
  it("counts an unreviewed case as UNKNOWN", () => {
    expect(handoffForPack(reports, "region-1").unknown).toBe(1);
  });
  it("tracks the latest pack event", () => {
    expect(handoffForPack(reports, "region-1").latest).toBe("2026-11-19T12:01:00.000Z");
  });
  it("tracks the latest manual decision", () => {
    expect(handoffForPack(reports, "region-1").decision).toBe("review");
  });
  it("tracks the latest event across the full document", () => {
    expect(handoffSummary(reports).lastUpdated).toBe("2026-11-19T12:03:00.000Z");
  });
  it("reports no latest timestamp for an empty journal", () => {
    expect(handoffSummary(doc()).lastUpdated).toBeNull();
  });
  it("uses the opened time when there are no notes", () => {
    expect(handoffUpdatedAt(sample("one"))).toBe("2026-11-19T12:00:00.000Z");
  });
  it("uses the last event timestamp when available", () => {
    const caseWithEvent = sample("one", "region-1", { events: [event("last", "review", "2026-11-19T12:04:00.000Z")] });
    expect(handoffUpdatedAt(caseWithEvent)).toBe("2026-11-19T12:04:00.000Z");
  });
  it("filters by pack ID", () => {
    expect(filterHandoffCases(reports, { packId: "region-1" })).toHaveLength(2);
  });
  it("filters by operation", () => {
    expect(filterHandoffCases(reports, { operation: "export" }).map((item) => item.id)).toEqual(["gamma"]);
  });
  it("filters by manual decision", () => {
    expect(filterHandoffCases(reports, { decision: "closed" }).map((item) => item.id)).toEqual(["gamma"]);
  });
  it("filters for UNKNOWN decisions explicitly", () => {
    expect(filterHandoffCases(reports, { decision: "UNKNOWN" }).map((item) => item.id)).toEqual(["alpha"]);
  });
  it("filters by case summary", () => {
    expect(filterHandoffCases(reports, { search: "file could not" })).toHaveLength(4);
  });
  it("filters by case ID", () => {
    expect(filterHandoffCases(reports, { search: "DELTA" }).map((item) => item.id)).toEqual(["delta"]);
  });
  it("filters by source reference", () => {
    expect(filterHandoffCases(reports, { search: "CATALOGUE" })).toHaveLength(4);
  });
  it("does not create results for unknown search text", () => {
    expect(filterHandoffCases(reports, { search: "unlisted-query" })).toEqual([]);
  });
  it("combines pack and decision filters", () => {
    expect(filterHandoffCases(reports, { packId: "region-1", decision: "review" }).map((item) => item.id)).toEqual(["beta"]);
  });
  it("does not mutate the original report during filtering", () => {
    filterHandoffCases(reports, { search: "alpha" });
    expect(reports.cases).toHaveLength(4);
  });
  it("generates the first unused case identifier", () => {
    expect(nextHandoffId(doc(sample("handoff-1")))).toBe("handoff-2");
  });
  it("fills a gap in case identifiers", () => {
    expect(nextHandoffId(doc(sample("handoff-2")))).toBe("handoff-1");
  });
  it("generates the first unused event identifier", () => {
    expect(nextEventId(sample("one"))).toBe("event-1");
  });
  it("fills gaps in event identifiers", () => {
    const original = sample("one", "region-1", { events: [event("event-2", "review", "2026-11-19T12:01:00.000Z")] });
    expect(nextEventId(original)).toBe("event-1");
  });
  it("ignores a source name when the current filter is empty", () => {
    expect(filterHandoffCases(reports, {})).toHaveLength(4);
  });
  it("rejects malformed documents before a new case is added", () => {
    const malformed = { ...doc(), cases: [sample("one", "region-1", { openedAt: "invalid" })] };
    expect(appendHandoffCase(malformed, sample("two"))).toEqual({ ok: false, issue: "time" });
  });
  it("rejects an event on a missing case even when other cases exist", () => {
    expect(appendHandoffEvent(reports, "not-there", event("new", "review", "2026-11-19T12:04:00.000Z"))).toEqual({ ok: false, issue: "unknown-pack" });
  });
  it("rejects adding a duplicate case to a valid report", () => {
    expect(appendHandoffCase(reports, sample("alpha"))).toEqual({ ok: false, issue: "duplicate" });
  });
  it("keeps all source metadata on an exported report", () => {
    const saved = unwrap(exportHandoffDocument(reports));
    expect(saved).toContain('"licence": "CC-BY-4.0"');
    expect(saved).toContain('"tier": "UNKNOWN"');
    expect(saved).toContain('"date": "2026-11-18"');
  });
  it("preserves the order of case entries", () => {
    expect(validateHandoffDocument(reports).ok).toBe(true);
    expect(reports.cases.map((item) => item.id)).toEqual(["alpha", "beta", "gamma", "delta"]);
  });
});
