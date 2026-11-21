import { describe, expect, it } from "vitest";
import {
  TRACE_LIMITS, TRACE_LICENCES, TRACE_OPERATIONS, TRACE_OUTCOMES, TRACE_STAGES, TRACE_TIERS,
  appendTrace, appendTraceMoment, changeTraceOutcome, filterTraces, mergeTraces,
  newTraceDocument, nextMomentId, nextTraceId, summarizeTraces, traceBytes,
  traceExport, traceId, traceImport, traceInstant, tracePreview, traceSource,
  validateMoment, validateTrace, validateTraceDocument,
  type TraceCase, type TraceDocument, type TraceMoment, type TraceSource,
} from "./recoverySessionTrace";

const source: TraceSource = {
  name: "Public records", licence: "CC0-1.0", date: "2026-11-19",
  tier: "UNKNOWN", reference: "record-1",
};
const moment = (patch: Partial<TraceMoment> = {}): TraceMoment => ({
  id: "moment-1", at: "2026-11-19T15:00:01.000Z", stage: "started",
  observedBytes: "UNKNOWN", note: "", ...patch,
});
const trace = (patch: Partial<TraceCase> = {}): TraceCase => ({
  id: "trace-1", packId: "region-1", operation: "download", outcome: "UNKNOWN",
  expectedBytes: "UNKNOWN", openedAt: "2026-11-19T15:00:00.000Z",
  source, moments: [], ...patch,
});
const documentWith = (...traces: TraceCase[]): TraceDocument => ({
  format: "local-recovery-session-trace", version: 1, traces,
});
const one = documentWith(trace());
function good<T>(result: { ok: boolean; value?: T }): T {
  expect(result.ok).toBe(true);
  if (!("value" in result) || result.value === undefined) throw Error("Expected valid result");
  return result.value;
}

describe("trace metadata validation", () => {
  it("starts from a blank document", () => expect(newTraceDocument()).toEqual(documentWith()));
  it("accepts the blank document", () => expect(validateTraceDocument(newTraceDocument()).ok).toBe(true));
  it("accepts the sample trace", () => expect(validateTrace(trace())).toBeNull());
  it("accepts the sample moment", () => expect(validateMoment(moment())).toBeNull());
  it("preserves the UNKNOWN value", () => expect(trace().outcome).toBe("UNKNOWN"));
  it("does not claim ready", () => expect(JSON.stringify(trace())).not.toContain('"ready"'));
  it("supports all operation kinds", () => {
    for (const operation of TRACE_OPERATIONS) expect(validateTrace(trace({ operation }))).toBeNull();
  });
  it("supports every declared outcome", () => {
    for (const outcome of TRACE_OUTCOMES) expect(validateTrace(trace({ outcome }))).toBeNull();
  });
  it("supports every declared stage", () => {
    for (const stage of TRACE_STAGES) expect(validateMoment(moment({ stage }))).toBeNull();
  });
  it("supports every declared evidence tier", () => {
    for (const tier of TRACE_TIERS) expect(traceSource({ ...source, tier })).toBe(true);
  });
  it("supports only named open licences", () => {
    for (const licence of TRACE_LICENCES) expect(traceSource({ ...source, licence })).toBe(true);
  });
  it("rejects a closed licence", () => expect(traceSource({ ...source, licence: "private" })).toBe(false));
  it("rejects absent source", () => expect(traceSource({ ...source, name: "" })).toBe(false));
  it("rejects whitespace-only source", () => expect(traceSource({ ...source, name: "    " })).toBe(false));
  it("rejects too-long source", () => expect(traceSource({ ...source, name: "x".repeat(TRACE_LIMITS.maxName + 1) })).toBe(false));
  it("rejects source markup", () => expect(traceSource({ ...source, name: "<span>" })).toBe(false));
  it("rejects an invalid source date", () => expect(traceSource({ ...source, date: "2026-02-31" })).toBe(false));
  it("rejects a missing source date", () => expect(traceSource({ ...source, date: "" })).toBe(false));
  it("rejects unknown evidence levels", () => expect(traceSource({ ...source, tier: "guessed" })).toBe(false));
  it("rejects missing licence", () => expect(traceSource({ ...source, licence: "" })).toBe(false));
  it("allows an empty optional reference", () => expect(traceSource({ ...source, reference: "" })).toBe(true));
  it("rejects markup in reference", () => expect(traceSource({ ...source, reference: "<id>" })).toBe(false));
  it("rejects control characters in reference", () => expect(traceSource({ ...source, reference: "a\nb" })).toBe(false));
  it("rejects long reference", () => expect(traceSource({ ...source, reference: "x".repeat(TRACE_LIMITS.maxReference + 1) })).toBe(false));
  it("rejects extra provenance keys", () => expect(traceSource({ ...source, extra: true })).toBe(false));
  it("rejects null provenance", () => expect(traceSource(null)).toBe(false));
  it("rejects array provenance", () => expect(traceSource([])).toBe(false));
  it("rejects string provenance", () => expect(traceSource("source")).toBe(false));
  it("rejects absent source tier", () => expect(traceSource({ ...source, tier: undefined })).toBe(false));
  it("keeps the supplied reference", () => expect(traceSource({ ...source, reference: "  record " })).toBe(true));
});

describe("strict local identifiers", () => {
  for (const id of ["x", "region-1", "local_2", "A.B", "a9", "test-100"]) {
    it(`accepts identifier ${id}`, () => expect(traceId(id)).toBe(true));
  }
  for (const id of ["", "..", ".", "../test", "bad/path", "a b", " x", "x ", "<id>", "x\ny", "x".repeat(TRACE_LIMITS.maxId + 1)]) {
    it(`rejects unsafe identifier ${JSON.stringify(id).slice(0, 24)}`, () => expect(traceId(id)).toBe(false));
  }
  it("does not accept an array", () => expect(traceId([])).toBe(false));
  it("does not accept null", () => expect(traceId(null)).toBe(false));
  it("does not accept a number", () => expect(traceId(1)).toBe(false));
  it("enforces the pack-id constraint", () => expect(validateTrace(trace({ packId: "../x" }))).toBe("identifier"));
  it("rejects extra trace properties", () => expect(validateTrace({ ...trace(), device: "local" })).toBe("format"));
  it("rejects missing pack ID", () => expect(validateTrace({ ...trace(), packId: "" })).toBe("identifier"));
  it("rejects missing trace ID", () => expect(validateTrace({ ...trace(), id: "" })).toBe("identifier"));
});

describe("strict timestamp validation", () => {
  for (const input of ["2026-11-19T15:00:00.000Z", "2026-01-01T00:00:00.000Z", "2028-02-29T23:59:59.999Z"]) {
    it(`accepts UTC instant ${input}`, () => expect(traceInstant(input)).toBe(true));
  }
  for (const input of ["", "tomorrow", "2026-11-19", "2026-11-19T15:00:00Z", "2026-11-19T15:00:00+00:00", "2026-11-19T25:00:00.000Z", "2026-02-31T15:00:00.000Z", "2025-02-29T15:00:00.000Z", "2026-11-19T15:61:00.000Z", "2026-11-19T15:00:61.000Z"]) {
    it(`rejects invalid instant ${input}`, () => expect(traceInstant(input)).toBe(false));
  }
  it("rejects missing time", () => expect(validateMoment({ ...moment(), at: null })).toBe("date"));
  it("rejects an event earlier than the case", () => expect(validateTrace(trace({ moments: [moment({ at: "2026-11-19T14:59:59.000Z" })] }))).toBe("sequence"));
  it("rejects an out-of-order second event", () => {
    const moments = [moment({ at: "2026-11-19T15:00:05.000Z" }), moment({ id: "moment-2", at: "2026-11-19T15:00:04.000Z" })];
    expect(validateTrace(trace({ moments }))).toBe("sequence");
  });
  it("allows two events at the same time when IDs differ", () => {
    const moments = [moment(), moment({ id: "moment-2" })];
    expect(validateTrace(trace({ moments }))).toBeNull();
  });
});

describe("UNKNOWN byte count policy", () => {
  for (const input of [0, 1, 50, 1024, 1024 * 1024, "UNKNOWN"]) {
    it(`allows byte value ${input}`, () => expect(traceBytes(input)).toBe(true));
  }
  for (const input of [-1, 0.5, 1.1, NaN, Infinity, -Infinity, null, "0", "unknown", "", 1024 * 1024 * 1024 + 1]) {
    it(`rejects byte value ${String(input)}`, () => expect(traceBytes(input)).toBe(false));
  }
  it("does not coerce string digits", () => expect(validateMoment({ ...moment(), observedBytes: "10" })).toBe("bytes"));
  it("does not infer expected size from observed size", () => {
    const added = good(appendTrace(newTraceDocument(), trace({ moments: [moment({ observedBytes: 500 })] })));
    expect(added.traces[0]?.expectedBytes).toBe("UNKNOWN");
  });
  it("does not infer observed size from expected size", () => {
    const added = good(appendTrace(newTraceDocument(), trace({ expectedBytes: 500, moments: [moment()] })));
    expect(added.traces[0]?.moments[0]?.observedBytes).toBe("UNKNOWN");
  });
});

describe("document lifecycle", () => {
  it("rejects extra document fields", () => expect(validateTraceDocument({ ...one, private: true }).ok).toBe(false));
  it("rejects a wrong document format", () => expect(validateTraceDocument({ ...one, format: "other" }).ok).toBe(false));
  it("rejects a future document version", () => expect(validateTraceDocument({ ...one, version: 2 }).ok).toBe(false));
  it("rejects missing traces", () => expect(validateTraceDocument({ format: one.format, version: 1 }).ok).toBe(false));
  it("rejects null document", () => expect(validateTraceDocument(null).ok).toBe(false));
  it("rejects a string document", () => expect(validateTraceDocument("test").ok).toBe(false));
  it("rejects too many traces", () => {
    const tooMany = Array.from({ length: TRACE_LIMITS.maxTraces + 1 }, (_, i) => trace({ id: `trace-${i}` }));
    expect(validateTraceDocument(documentWith(...tooMany))).toEqual({ ok: false, issue: "limit" });
  });
  it("rejects duplicate trace IDs", () => expect(validateTraceDocument(documentWith(trace(), trace()))).toEqual({ ok: false, issue: "duplicate" }));
  it("rejects duplicate moment IDs", () => expect(validateTrace(trace({ moments: [moment(), moment()] }))).toBe("duplicate"));
  it("rejects too many moments", () => {
    const moments = Array.from({ length: TRACE_LIMITS.maxMoments + 1 }, (_, i) => moment({ id: `moment-${i}` }));
    expect(validateTrace(trace({ moments }))).toBe("limit");
  });
  it("rejects malformed moment entries", () => expect(validateTrace(trace({ moments: [null as unknown as TraceMoment] }))).toBe("format"));
  it("rejects extra event fields", () => expect(validateMoment({ ...moment(), extra: 1 })).toBe("format"));
  it("rejects a long note", () => expect(validateMoment({ ...moment(), note: "x".repeat(TRACE_LIMITS.maxText + 1) })).toBe("text"));
  it("rejects markup notes", () => expect(validateMoment({ ...moment(), note: "<script>" })).toBe("text"));
  it("rejects multiline notes", () => expect(validateMoment({ ...moment(), note: "a\nb" })).toBe("text"));
  it("accepts an intentionally blank note", () => expect(validateMoment(moment({ note: "" }))).toBeNull());
  it("rejects an unsupported operation", () => expect(validateTrace({ ...trace(), operation: "remove" })).toBe("format"));
  it("rejects an unsupported outcome", () => expect(validateTrace({ ...trace(), outcome: "ready" })).toBe("outcome"));
  it("rejects an unsupported stage", () => expect(validateMoment({ ...moment(), stage: "finished" })).toBe("stage"));
  it("rejects malformed trace source", () => expect(validateTrace({ ...trace(), source: {} })).toBe("source"));
  it("adds a new trace", () => expect(good(appendTrace(newTraceDocument(), trace())).traces).toHaveLength(1));
  it("rejects adding duplicate trace", () => expect(appendTrace(one, trace())).toEqual({ ok: false, issue: "duplicate" }));
  it("does not mutate the original document", () => {
    const result = good(appendTrace(one, trace({ id: "trace-2" })));
    expect(result).not.toBe(one);
    expect(one.traces).toHaveLength(1);
  });
  it("does not mutate its source object", () => {
    const original = trace();
    const added = good(appendTrace(newTraceDocument(), original));
    expect(added.traces[0]?.source).toEqual(original.source);
    expect(added.traces[0]?.source).not.toBe(original.source);
  });
  it("does not mutate its moments", () => {
    const original = trace({ moments: [moment()] });
    const added = good(appendTrace(newTraceDocument(), original));
    expect(added.traces[0]?.moments[0]).not.toBe(original.moments[0]);
  });
  it("appends an observation", () => {
    const added = good(appendTraceMoment(one, "trace-1", moment()));
    expect(added.traces[0]?.moments).toHaveLength(1);
  });
  it("rejects an observation for an unknown trace", () => expect(appendTraceMoment(one, "missing", moment())).toEqual({ ok: false, issue: "unknown-pack" }));
  it("rejects an out-of-order observation", () => {
    const after = documentWith(trace({ moments: [moment({ at: "2026-11-19T15:00:10.000Z" })] }));
    expect(appendTraceMoment(after, "trace-1", moment({ id: "moment-2" }))).toEqual({ ok: false, issue: "sequence" });
  });
  it("rejects duplicate observation ID", () => {
    const after = documentWith(trace({ moments: [moment()] }));
    expect(appendTraceMoment(after, "trace-1", moment())).toEqual({ ok: false, issue: "duplicate" });
  });
  it("adds a distinct second observation", () => {
    const after = documentWith(trace({ moments: [moment()] }));
    const result = good(appendTraceMoment(after, "trace-1", moment({ id: "moment-2", stage: "reviewed" })));
    expect(result.traces[0]?.moments).toHaveLength(2);
  });
  it("does not modify the original event history", () => {
    const after = documentWith(trace({ moments: [moment()] }));
    const result = good(appendTraceMoment(after, "trace-1", moment({ id: "moment-2" })));
    expect(after.traces[0]?.moments).toHaveLength(1);
    expect(result.traces[0]?.moments).toHaveLength(2);
  });
  it("allows a user-reported complete outcome without changing a pack", () => {
    const changed = good(changeTraceOutcome(one, "trace-1", "reported-complete"));
    expect(changed.traces[0]?.outcome).toBe("reported-complete");
    expect(changed.traces[0]?.expectedBytes).toBe("UNKNOWN");
  });
  it("rejects unknown trace outcome update", () => expect(changeTraceOutcome(one, "missing", "stopped")).toEqual({ ok: false, issue: "unknown-pack" }));
  it("rejects invalid outcome update", () => expect(changeTraceOutcome(one, "trace-1", "ready" as never)).toEqual({ ok: false, issue: "outcome" }));
  it("rejects restarting a stopped trace", () => {
    const stopped = documentWith(trace({ outcome: "stopped" }));
    expect(changeTraceOutcome(stopped, "trace-1", "in-progress")).toEqual({ ok: false, issue: "transition" });
  });
  it("rejects changing a reported-complete trace", () => {
    const completed = documentWith(trace({ outcome: "reported-complete" }));
    expect(changeTraceOutcome(completed, "trace-1", "UNKNOWN")).toEqual({ ok: false, issue: "transition" });
  });
});

describe("safe JSON roundtrip and import", () => {
  it("exports a bounded document", () => expect(traceExport(one).ok).toBe(true));
  it("exports newline-terminated JSON", () => expect(good(traceExport(one)).endsWith("\n")).toBe(true));
  it("roundtrips the contents", () => expect(traceImport(good(traceExport(one)))).toEqual({ ok: true, value: one }));
  it("does not introduce a ready state", () => expect(good(traceExport(one))).not.toContain('"ready"'));
  it("rejects broken JSON", () => expect(traceImport("{")).toEqual({ ok: false, issue: "format" }));
  it("rejects a huge input", () => expect(traceImport("x".repeat(TRACE_LIMITS.maxBytes + 1))).toEqual({ ok: false, issue: "limit" }));
  it("rejects a JSON number", () => expect(traceImport("1")).toEqual({ ok: false, issue: "format" }));
  it("rejects a JSON array", () => expect(traceImport("[]")).toEqual({ ok: false, issue: "format" }));
  it("rejects a JSON object without format", () => expect(traceImport("{}")).toEqual({ ok: false, issue: "format" }));
  it("rejects duplicate IDs in import", () => {
    expect(traceImport(JSON.stringify(documentWith(trace(), trace())))).toEqual({ ok: false, issue: "duplicate" });
  });
  it("rejects invalid document during export", () => {
    expect(traceExport({ ...one, version: 9 } as unknown as TraceDocument)).toEqual({ ok: false, issue: "format" });
  });
  it("sorts no traces implicitly", () => {
    const input = documentWith(trace({ id: "z" }), trace({ id: "a" }));
    expect(good(traceImport(good(traceExport(input)))).traces.map((t) => t.id)).toEqual(["z", "a"]);
  });
});

describe("non-destructive merge", () => {
  it("identifies a new trace", () => {
    const preview = good(tracePreview(one, documentWith(trace({ id: "trace-2" }))));
    expect(preview.added.map((t) => t.id)).toEqual(["trace-2"]);
  });
  it("identifies an unchanged trace", () => {
    const preview = good(tracePreview(one, one));
    expect(preview.same).toEqual(["trace-1"]);
  });
  it("identifies a collision", () => {
    const preview = good(tracePreview(one, documentWith(trace({ expectedBytes: 100 }))));
    expect(preview.collisions).toEqual(["trace-1"]);
  });
  it("does not replace conflicting trace history", () => {
    const incoming = documentWith(trace({ expectedBytes: 100 }));
    expect(mergeTraces(one, incoming)).toEqual({ ok: false, issue: "conflict" });
    expect(one.traces[0]?.expectedBytes).toBe("UNKNOWN");
  });
  it("merges a distinct trace safely", () => {
    const incoming = documentWith(trace({ id: "trace-2" }));
    const result = good(mergeTraces(one, incoming));
    expect(result.traces).toHaveLength(2);
    expect(one.traces).toHaveLength(1);
  });
  it("does not duplicate an identical trace", () => {
    const result = good(mergeTraces(one, one));
    expect(result.traces).toHaveLength(1);
  });
  it("rejects malformed incoming document", () => {
    const incoming = { ...one, version: 2 } as unknown as TraceDocument;
    expect(tracePreview(one, incoming)).toEqual({ ok: false, issue: "format" });
  });
  it("enforces aggregate trace count on merge", () => {
    const many = documentWith(...Array.from({ length: TRACE_LIMITS.maxTraces }, (_, i) => trace({ id: `trace-${i}` })));
    expect(tracePreview(many, documentWith(trace({ id: "fresh" })))).toEqual({ ok: false, issue: "limit" });
  });
});

describe("search, grouping, and summarisation", () => {
  const multiple = documentWith(
    trace(), trace({ id: "trace-2", packId: "region-2", outcome: "stopped", operation: "export" }),
    trace({ id: "trace-3", outcome: "in-progress", source: { ...source, name: "Open catalogue" } }),
    trace({ id: "trace-4", outcome: "reported-complete", expectedBytes: 100 }),
  );
  it("counts total traces", () => expect(summarizeTraces(multiple).total).toBe(4));
  it("counts UNKNOWN outcomes", () => expect(summarizeTraces(multiple).unknown).toBe(1));
  it("counts stopped outcomes", () => expect(summarizeTraces(multiple).stopped).toBe(1));
  it("counts progress outcomes", () => expect(summarizeTraces(multiple).inProgress).toBe(1));
  it("counts reported complete", () => expect(summarizeTraces(multiple).reportedComplete).toBe(1));
  it("counts traces without moments", () => expect(summarizeTraces(multiple).withNoMoments).toBe(4));
  it("finds by pack", () => expect(filterTraces(multiple, { packId: "region-2" })).toHaveLength(1));
  it("filters by operation", () => expect(filterTraces(multiple, { operation: "export" })).toHaveLength(1));
  it("filters by outcome", () => expect(filterTraces(multiple, { outcome: "stopped" })).toHaveLength(1));
  it("filters case-insensitively", () => expect(filterTraces(multiple, { text: "CATALOGUE" })).toHaveLength(1));
  it("filters by identifier", () => expect(filterTraces(multiple, { text: "trace-4" })).toHaveLength(1));
  it("filters by source reference", () => expect(filterTraces(multiple, { text: "record-1" })).toHaveLength(4));
  it("does not create a hidden filter", () => expect(filterTraces(multiple, {})).toHaveLength(4));
  it("returns an empty result for missing packs", () => expect(filterTraces(multiple, { packId: "missing" })).toEqual([]));
  it("returns an empty result for no matching query", () => expect(filterTraces(multiple, { text: "does-not-exist" })).toEqual([]));
  it("supports combined filters", () => expect(filterTraces(multiple, { packId: "region-1", operation: "download", outcome: "in-progress" })).toHaveLength(1));
  it("generates the next trace ID", () => expect(nextTraceId(one)).toBe("trace-2"));
  it("generates a unique event ID", () => expect(nextMomentId(trace({ moments: [moment()] }))).toBe("moment-2"));
});
