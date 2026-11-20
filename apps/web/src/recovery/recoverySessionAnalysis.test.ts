import { describe, expect, it } from "vitest";
import {
  MAX_GAP_MS, assessTrace, assessTraceDocument, compareTraceDocuments,
  findingsByCode, findingsForTrace, summarizeTracePacks, traceRecommendations, traceSequence,
} from "./recoverySessionAnalysis";
import type { TraceCase, TraceDocument, TraceMoment } from "./recoverySessionTrace";

const source = {
  name: "Open public record", licence: "CC-BY-4.0", date: "2026-11-19",
  tier: "UNKNOWN" as const, reference: "file-one",
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
const doc = (...traces: TraceCase[]): TraceDocument => ({ format: "local-recovery-session-trace", version: 1, traces });
function ready<T>(result: { ok: boolean; value?: T }): T {
  expect(result.ok).toBe(true);
  if (!("value" in result) || result.value === undefined) throw new Error("No report");
  return result.value;
}

describe("fail-closed analysis", () => {
  it("returns UNKNOWN for an empty history", () => expect(assessTrace(trace()).status).toBe("UNKNOWN"));
  it("does not mark any pack ready", () => expect(assessTrace(trace()).isPackReady).toBe(false));
  it("keeps the expected byte count UNKNOWN", () => expect(assessTrace(trace()).largestObservedBytes).toBe("UNKNOWN"));
  it("does not infer a last observed time", () => expect(assessTrace(trace()).lastObservedAt).toBeNull());
  it("reports the empty-history finding", () => expect(assessTrace(trace()).findings.map((f) => f.code)).toContain("no-moments"));
  it("reports unknown size", () => expect(assessTrace(trace()).findings.map((f) => f.code)).toContain("unknown-expected-size"));
  it("reports missing review notes", () => expect(assessTrace(trace()).findings.map((f) => f.code)).toContain("no-review"));
  it("reports missing source reference", () => {
    const value = trace({ source: { ...source, reference: "" } });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("no-source-reference");
  });
  it("does not infer readiness from a reported complete outcome", () => {
    const value = trace({ outcome: "reported-complete" });
    expect(assessTrace(value).isPackReady).toBe(false);
  });
  it("flags a reported completion without review", () => {
    const value = trace({ outcome: "reported-complete" });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("reported-complete-without-evidence");
  });
  it("marks reported completion without review for attention", () => {
    const value = trace({ outcome: "reported-complete" });
    expect(assessTrace(value).status).toBe("attention");
  });
  it("flags a stopped status without stop observation", () => {
    const value = trace({ outcome: "stopped" });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("stopped-without-stop-note");
  });
  it("treats a stopped outcome without note as attention", () => {
    const value = trace({ outcome: "stopped" });
    expect(assessTrace(value).status).toBe("attention");
  });
  it("describes progress as user-reported", () => {
    const value = trace({ outcome: "in-progress" });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("reported-progress");
  });
  it("keeps no-moment progress UNKNOWN", () => {
    const value = trace({ outcome: "in-progress" });
    expect(assessTrace(value).status).toBe("UNKNOWN");
  });
  it("counts the recorded moments", () => {
    const value = trace({ moments: [moment()] });
    expect(assessTrace(value).recordedMoments).toBe(1);
  });
  it("includes the final observed time", () => {
    const value = trace({ moments: [moment()] });
    expect(assessTrace(value).lastObservedAt).toBe("2026-11-19T15:00:01.000Z");
  });
  it("does not substitute missing observed bytes", () => {
    const value = trace({ expectedBytes: 100, moments: [moment()] });
    expect(assessTrace(value).largestObservedBytes).toBe("UNKNOWN");
  });
  it("uses the largest explicitly observed byte count", () => {
    const value = trace({ expectedBytes: 100, moments: [
      moment({ observedBytes: 20 }), moment({ id: "moment-2", observedBytes: 60, at: "2026-11-19T15:00:02.000Z" }),
    ] });
    expect(assessTrace(value).largestObservedBytes).toBe(60);
  });
  it("warns if observation exceeds expected bytes", () => {
    const value = trace({ expectedBytes: 100, moments: [moment({ observedBytes: 150 })] });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("observed-over-expected");
  });
  it("keeps the excess size detail", () => {
    const value = trace({ expectedBytes: 100, moments: [moment({ observedBytes: 150 })] });
    expect(assessTrace(value).findings.find((f) => f.code === "observed-over-expected")?.detail).toBe(50);
  });
  it("marks excess size for attention", () => {
    const value = trace({ expectedBytes: 100, moments: [moment({ observedBytes: 150 })] });
    expect(assessTrace(value).status).toBe("attention");
  });
  it("does not misclassify equal size as excess", () => {
    const value = trace({ expectedBytes: 100, moments: [moment({ observedBytes: 100 })] });
    expect(assessTrace(value).findings.map((f) => f.code)).not.toContain("observed-over-expected");
  });
  it("detects decreasing observed bytes", () => {
    const value = trace({ expectedBytes: 100, moments: [
      moment({ observedBytes: 80 }), moment({ id: "moment-2", observedBytes: 40, at: "2026-11-19T15:00:02.000Z" }),
    ] });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("changing-size");
  });
  it("does not infer a decrease across unknown samples", () => {
    const value = trace({ expectedBytes: 100, moments: [
      moment({ observedBytes: 80 }), moment({ id: "moment-2", observedBytes: "UNKNOWN", at: "2026-11-19T15:00:02.000Z" }),
    ] });
    expect(assessTrace(value).findings.map((f) => f.code)).not.toContain("changing-size");
  });
  it("does not infer an increase across unknown samples", () => {
    const value = trace({ expectedBytes: 100, moments: [
      moment({ observedBytes: "UNKNOWN" }), moment({ id: "moment-2", observedBytes: 80, at: "2026-11-19T15:00:02.000Z" }),
    ] });
    expect(assessTrace(value).findings.map((f) => f.code)).not.toContain("changing-size");
  });
  it("warns when first stage was not started", () => {
    const value = trace({ moments: [moment({ stage: "reading" })] });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("missing-start");
  });
  it("does not warn when stage begins with started", () => {
    const value = trace({ moments: [moment({ stage: "started" })] });
    expect(assessTrace(value).findings.map((f) => f.code)).not.toContain("missing-start");
  });
  it("recognises an explicit reviewed moment", () => {
    const value = trace({ moments: [moment({ stage: "reviewed" })] });
    expect(assessTrace(value).findings.map((f) => f.code)).not.toContain("no-review");
  });
  it("does not confuse a note with an explicit review stage", () => {
    const value = trace({ moments: [moment({ note: "I looked at the file" })] });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("no-review");
  });
  it("warns about a time gap", () => {
    const value = trace({ moments: [moment({ at: "2026-11-19T18:00:01.000Z" })] });
    expect(assessTrace(value).findings.map((f) => f.code)).toContain("time-gap");
  });
  it("preserves the length of the time gap", () => {
    const value = trace({ moments: [moment({ at: "2026-11-19T18:00:01.000Z" })] });
    expect(assessTrace(value).findings.find((f) => f.code === "time-gap")?.detail).toBe(10801000);
  });
  it("does not flag the exact gap threshold", () => {
    const value = trace({ moments: [moment({ at: "2026-11-19T17:00:00.000Z" })] });
    expect(MAX_GAP_MS).toBe(7200000);
    expect(assessTrace(value).findings.map((f) => f.code)).not.toContain("time-gap");
  });
  it("selects source review when the reference is absent", () => {
    const value = trace({ source: { ...source, reference: "" } });
    expect(assessTrace(value).nextStep).toBe("check-source");
  });
  it("selects history review on anomalous bytes", () => {
    const value = trace({ expectedBytes: 10, moments: [moment({ observedBytes: 12 })] });
    expect(assessTrace(value).nextStep).toBe("review-history");
  });
  it("selects manual inspection for unknown bytes", () => {
    const value = trace({ expectedBytes: "UNKNOWN" });
    expect(assessTrace(value).nextStep).toBe("inspect-local");
  });
  it("does not make unsupported retry calls", () => {
    const value = trace({ outcome: "stopped", moments: [
      moment({ observedBytes: 10, stage: "started" }),
      moment({ id: "moment-2", at: "2026-11-19T15:00:02.000Z", stage: "stopped", observedBytes: 10 }),
      moment({ id: "moment-3", at: "2026-11-19T15:00:03.000Z", stage: "reviewed", observedBytes: 10 }),
    ], expectedBytes: 100 });
    expect(assessTrace(value).nextStep).toBe("consider-manual-retry");
  });
  it("can describe a fully documented user report without declaring readiness", () => {
    const value = trace({ outcome: "reported-complete", expectedBytes: 10, moments: [
      moment({ observedBytes: 0 }),
      moment({ id: "moment-2", at: "2026-11-19T15:00:02.000Z", stage: "reviewed", observedBytes: 10 }),
    ] });
    const report = assessTrace(value);
    expect(report.status).toBe("documented");
    expect(report.isPackReady).toBe(false);
  });
});

describe("timeline deltas", () => {
  it("returns no points for an empty trace", () => expect(traceSequence(trace())).toEqual([]));
  it("returns one point per observed moment", () => {
    const value = trace({ moments: [moment(), moment({ id: "moment-2" })] });
    expect(traceSequence(value)).toHaveLength(2);
  });
  it("preserves UNKNOWN as first delta", () => {
    const value = trace({ moments: [moment({ observedBytes: 10 })] });
    expect(traceSequence(value)[0]?.delta).toBe("UNKNOWN");
  });
  it("computes positive byte delta", () => {
    const value = trace({ moments: [moment({ observedBytes: 10 }), moment({ id: "moment-2", observedBytes: 20 })] });
    expect(traceSequence(value)[1]?.delta).toBe(10);
  });
  it("computes negative byte delta without hiding it", () => {
    const value = trace({ moments: [moment({ observedBytes: 30 }), moment({ id: "moment-2", observedBytes: 20 })] });
    expect(traceSequence(value)[1]?.delta).toBe(-10);
  });
  it("preserves UNKNOWN across a gap", () => {
    const value = trace({ moments: [moment({ observedBytes: 30 }), moment({ id: "moment-2", observedBytes: "UNKNOWN" })] });
    expect(traceSequence(value)[1]?.delta).toBe("UNKNOWN");
  });
  it("includes the milliseconds from open to first observation", () => {
    const value = trace({ moments: [moment()] });
    expect(traceSequence(value)[0]?.elapsedMs).toBe(1000);
  });
  it("includes the interval between observations", () => {
    const value = trace({ moments: [moment(), moment({ id: "moment-2", at: "2026-11-19T15:00:11.000Z" })] });
    expect(traceSequence(value)[1]?.elapsedMs).toBe(10000);
  });
  it("preserves the user-described stage", () => {
    const value = trace({ moments: [moment({ stage: "writing" })] });
    expect(traceSequence(value)[0]?.stage).toBe("writing");
  });
});

describe("document and pack summaries", () => {
  const a = trace({ expectedBytes: 100, outcome: "stopped", moments: [moment({ observedBytes: 10 })] });
  const b = trace({ id: "trace-2", expectedBytes: "UNKNOWN", packId: "region-2", source: { ...source, name: "Second public source", licence: "ODbL-1.0" } });
  const c = trace({ id: "trace-3", packId: "region-1", outcome: "reported-complete", source: { ...source, date: "2026-11-18" } });
  const combined = doc(a, b, c);
  it("accepts the complete document", () => expect(assessTraceDocument(combined).ok).toBe(true));
  it("counts every case", () => expect(ready(assessTraceDocument(combined)).total).toBe(3));
  it("never produces a ready pack count", () => expect(ready(assessTraceDocument(combined)).readyCount).toBe(0));
  it("keeps findings attached to trace IDs", () => {
    const report = ready(assessTraceDocument(combined));
    expect(findingsForTrace(report, "trace-2").every((f) => f.traceId === "trace-2")).toBe(true);
  });
  it("filters findings by code", () => {
    const report = ready(assessTraceDocument(combined));
    expect(findingsByCode(report, "unknown-expected-size").length > 0).toBe(true);
  });
  it("gives each suggested action its trace ID", () => {
    const report = ready(assessTraceDocument(combined));
    expect(traceRecommendations(report).every((one) => one.traceId.length > 0)).toBe(true);
  });
  it("rejects malformed input before analysis", () => {
    const broken = { ...combined, version: 2 } as unknown as TraceDocument;
    expect(assessTraceDocument(broken)).toEqual({ ok: false, issue: "format" });
  });
  it("groups by pack", () => expect(summarizeTracePacks(combined)).toHaveLength(2));
  it("sorts packs by identifier", () => expect(summarizeTracePacks(combined).map((p) => p.packId)).toEqual(["region-1", "region-2"]));
  it("counts reports for the first pack", () => expect(summarizeTracePacks(combined)[0]?.total).toBe(2));
  it("does not infer pack readiness from notes", () => expect(summarizeTracePacks(combined).every((p) => p.readiness === "UNKNOWN")).toBe(true));
  it("includes all source names", () => expect(summarizeTracePacks(combined)[1]?.sourceNames).toEqual(["Second public source"]));
  it("preserves open-licence attribution", () => expect(summarizeTracePacks(combined)[1]?.licences).toEqual(["ODbL-1.0"]));
  it("preserves source dates", () => expect(summarizeTracePacks(combined)[0]?.sourceDates).toEqual(["2026-11-18", "2026-11-19"]));
  it("preserves tier UNKNOWN", () => expect(summarizeTracePacks(combined)[0]?.tiers).toEqual(["UNKNOWN"]));
  it("counts explicitly observed bytes", () => expect(summarizeTracePacks(combined)[0]?.totalKnownBytes).toBe(10));
  it("counts missing expected sizes", () => expect(summarizeTracePacks(combined)[1]?.missingByteCounts).toBe(1));
  it("computes the latest known timestamp", () => expect(summarizeTracePacks(combined)[0]?.latestTimestamp).toBe("2026-11-19T15:00:01.000Z"));
});

describe("comparison never overwrites earlier evidence", () => {
  const before = doc(trace());
  it("marks identical traces as same", () => expect(ready(compareTraceDocuments(before, before))[0]?.change).toBe("same"));
  it("marks a new trace as added", () => {
    const after = doc(trace(), trace({ id: "trace-2" }));
    expect(ready(compareTraceDocuments(before, after)).find((t) => t.traceId === "trace-2")?.change).toBe("added");
  });
  it("marks a removed trace as missing", () => {
    expect(ready(compareTraceDocuments(before, doc()))[0]?.change).toBe("missing");
  });
  it("marks changed outcome as changed", () => {
    const after = doc(trace({ outcome: "stopped" }));
    expect(ready(compareTraceDocuments(before, after))[0]?.change).toBe("changed");
  });
  it("does not rewrite the original snapshot", () => {
    compareTraceDocuments(before, doc(trace({ expectedBytes: 100 })));
    expect(before.traces[0]?.expectedBytes).toBe("UNKNOWN");
  });
  it("retains prior assessment", () => {
    const after = doc(trace({ expectedBytes: 100 }));
    expect(ready(compareTraceDocuments(before, after))[0]?.previous).toBe("UNKNOWN");
  });
  it("reports source changes", () => {
    const after = doc(trace({ source: { ...source, name: "New public source" } }));
    expect(ready(compareTraceDocuments(before, after))[0]?.sourceChanged).toBe(true);
  });
  it("does not claim source changes when unchanged", () => {
    const after = doc(trace({ expectedBytes: 100 }));
    expect(ready(compareTraceDocuments(before, after))[0]?.sourceChanged).toBe(false);
  });
  it("counts new observations", () => {
    const after = doc(trace({ moments: [moment()] }));
    expect(ready(compareTraceDocuments(before, after))[0]?.momentsAdded).toBe(1);
  });
  it("keeps comparison on malformed input closed", () => {
    const invalid = { ...before, format: "other" } as unknown as TraceDocument;
    expect(compareTraceDocuments(before, invalid)).toEqual({ ok: false, issue: "format" });
  });
  it("sorts comparisons by trace identifier", () => {
    const x = doc(trace({ id: "z" }), trace({ id: "a" }));
    expect(ready(compareTraceDocuments(x, x)).map((c) => c.traceId)).toEqual(["a", "z"]);
  });
});
