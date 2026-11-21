import { describe, expect, it } from "vitest";
import {
  DRILL_CONDITIONS, DRILL_EVENTS, DRILL_KINDS, DRILL_LIMITS, DRILL_OUTCOMES,
  DRILL_PHASES, DRILL_TIERS, addDrillRun, appendDrillEvent, changeDrillPhase,
  checkDrillDocument, checkDrillEvent, checkDrillProvenance, checkDrillRun,
  checkDrillStep, drillContentReady, emptyDrillDocument, eventsForDrill,
  filterDrillRuns, mergeDrillDocuments, nextDrillId, parseDrills,
  previewDrillMerge, recordDrillStep, serializeDrills, stepsForDrill,
  summarizeDrills, type DrillDocument, type DrillEvent, type DrillProvenance,
  type DrillRun, type DrillStep,
} from "./recoveryDrillRun";
const date = "2026-11-20";
const time = "2026-11-20T12:00:00.000Z";
const later = "2026-11-20T13:00:00.000Z";
const provenance: DrillProvenance = {
  source: "Local inspection", licence: "Test licence", retrievedOn: date,
  tier: "UNKNOWN", reference: "manual-record",
};
const run = (id = "run-1", changes: Partial<DrillRun> = {}): DrillRun => ({
  id, packId: "pack-one", kind: "inventory", phase: "draft", title: "Check missing pack",
  openedAt: time, condition: "UNKNOWN", provenance, ...changes,
});
const step = (id = "step-1", changes: Partial<DrillStep> = {}): DrillStep => ({
  id, runId: "run-1", label: "Inspect installed metadata", condition: "UNKNOWN",
  outcome: "UNKNOWN", note: "No external facts inferred", recordedAt: later,
  provenance, ...changes,
});
const event = (id = "event-1", changes: Partial<DrillEvent> = {}): DrillEvent => ({
  id, runId: "run-1", at: later, kind: "note", note: "Manual note", stepId: null,
  provenance, ...changes,
});
const document = (runs: readonly DrillRun[] = [run()], steps: readonly DrillStep[] = [], events: readonly DrillEvent[] = []): DrillDocument => ({
  ...emptyDrillDocument(), runs, steps, events,
});
const invalid = (result: { readonly ok: boolean }): boolean => !result.ok;

describe("rehearsal model schema and provenance", () => {
  it("starts with an empty versioned document", () => {
    expect(emptyDrillDocument()).toEqual({ schema: "the-app.recovery-drill-run.v1", runs: [], steps: [], events: [] });
  });
  it("accepts valid explicit provenance", () => {
    expect(checkDrillProvenance(provenance)).toEqual({ ok: true, value: provenance });
  });
  it("does not infer the source from a missing field", () => {
    expect(invalid(checkDrillProvenance({ ...provenance, source: "" }))).toBe(true);
  });
  it("rejects whitespace-only source", () => {
    expect(invalid(checkDrillProvenance({ ...provenance, source: "  " }))).toBe(true);
  });
  it("requires a licence", () => {
    expect(invalid(checkDrillProvenance({ ...provenance, licence: "" }))).toBe(true);
  });
  it("requires a reference string", () => {
    expect(invalid(checkDrillProvenance({ ...provenance, reference: "" }))).toBe(true);
  });
  it("rejects an impossible retrieval date", () => {
    expect(invalid(checkDrillProvenance({ ...provenance, retrievedOn: "2026-02-30" }))).toBe(true);
  });
  it("rejects an unrecognized evidence tier", () => {
    expect(invalid(checkDrillProvenance({ ...provenance, tier: "claimed" }))).toBe(true);
  });
  it("accepts literal UNKNOWN evidence", () => {
    expect(checkDrillProvenance({ ...provenance, tier: "UNKNOWN" }).ok).toBe(true);
  });
  it("rejects control characters in evidence source", () => {
    expect(invalid(checkDrillProvenance({ ...provenance, source: "bad\u0000value" }))).toBe(true);
  });
  it("rejects an evidence source that exceeds its limit", () => {
    expect(invalid(checkDrillProvenance({ ...provenance, source: "a".repeat(DRILL_LIMITS.text + 1) }))).toBe(true);
  });
  it("rejects missing provenance object", () => {
    expect(invalid(checkDrillProvenance(null))).toBe(true);
  });
  it("keeps the declared condition vocabulary", () => {
    expect(DRILL_CONDITIONS).toEqual(["UNKNOWN", "offline", "interrupted", "missing", "conflict", "recovered"]);
  });
  it("keeps the declared tier vocabulary", () => {
    expect(DRILL_TIERS).toContain("UNKNOWN");
  });
  it("keeps all five rehearsal kinds", () => {
    expect(DRILL_KINDS).toEqual(["inventory", "offline-open", "interruption", "handoff", "export"]);
  });
  it("preserves the unknown and not-run outcomes", () => {
    expect(DRILL_OUTCOMES).toEqual(["UNKNOWN", "pass", "fail", "not-run"]);
  });
  it("keeps a closed state distinct from content readiness", () => {
    expect(DRILL_PHASES).toEqual(["draft", "in-progress", "paused", "closed"]);
    expect(drillContentReady()).toBe(false);
  });
  it("supports explicit manual note events", () => {
    expect(DRILL_EVENTS).toContain("note");
  });
});

describe("run and step validation", () => {
  it("accepts a complete run", () => {
    expect(checkDrillRun(run())).toEqual({ ok: true, value: run() });
  });
  it("rejects absent run identity", () => {
    expect(invalid(checkDrillRun({ ...run(), id: "" }))).toBe(true);
  });
  it("rejects identifiers with spaces", () => {
    expect(invalid(checkDrillRun({ ...run(), id: "run 1" }))).toBe(true);
  });
  it("rejects an unsupported pack identifier", () => {
    expect(invalid(checkDrillRun({ ...run(), packId: "/etc/passwd" }))).toBe(true);
  });
  it("rejects an unrecognized rehearsal kind", () => {
    expect(invalid(checkDrillRun({ ...run(), kind: "automatic" }))).toBe(true);
  });
  it("rejects an unsupported run phase", () => {
    expect(invalid(checkDrillRun({ ...run(), phase: "ready" }))).toBe(true);
  });
  it("rejects an unsupported observed condition", () => {
    expect(invalid(checkDrillRun({ ...run(), condition: "approved" }))).toBe(true);
  });
  it("allows literal UNKNOWN condition", () => {
    expect(checkDrillRun(run("run-1", { condition: "UNKNOWN" })).ok).toBe(true);
  });
  it("rejects missing run title", () => {
    expect(invalid(checkDrillRun({ ...run(), title: "" }))).toBe(true);
  });
  it("rejects malformed timestamps", () => {
    expect(invalid(checkDrillRun({ ...run(), openedAt: "today" }))).toBe(true);
  });
  it("rejects impossible timestamp", () => {
    expect(invalid(checkDrillRun({ ...run(), openedAt: "2026-25-45T12:00:00Z" }))).toBe(true);
  });
  it("does not accept arrays as run records", () => {
    expect(invalid(checkDrillRun([]))).toBe(true);
  });
  it("accepts complete step", () => {
    expect(checkDrillStep(step())).toEqual({ ok: true, value: step() });
  });
  it("requires an associated run", () => {
    expect(invalid(checkDrillStep({ ...step(), runId: "" }))).toBe(true);
  });
  it("requires a step label", () => {
    expect(invalid(checkDrillStep({ ...step(), label: " " }))).toBe(true);
  });
  it("rejects an unrecognized step outcome", () => {
    expect(invalid(checkDrillStep({ ...step(), outcome: "success" }))).toBe(true);
  });
  it("preserves a recorded failure", () => {
    expect(checkDrillStep(step("step-1", { outcome: "fail" })).ok).toBe(true);
  });
  it("does not upgrade unknown outcome", () => {
    const result = checkDrillStep(step());
    expect(result.ok && result.value.outcome).toBe("UNKNOWN");
  });
  it("rejects a step note with invalid control bytes", () => {
    expect(invalid(checkDrillStep({ ...step(), note: "x\u0007" }))).toBe(true);
  });
  it("rejects a step before the associated run", () => {
    expect(invalid(checkDrillDocument(document([run()], [step("step-1", { recordedAt: "2026-11-19T12:00:00.000Z" })])))).toBe(true);
  });
  it("rejects orphan steps", () => {
    expect(invalid(checkDrillDocument(document([run()], [step("step-1", { runId: "not-here" })])))).toBe(true);
  });
  it("rejects duplicate step identifiers", () => {
    expect(invalid(checkDrillDocument(document([run()], [step(), step()])))).toBe(true);
  });
  it("accepts multiple independent steps", () => {
    expect(checkDrillDocument(document([run()], [step(), step("step-2")])).ok).toBe(true);
  });
});

describe("event validation and document graph", () => {
  it("accepts an explicit note event", () => {
    expect(checkDrillEvent(event())).toEqual({ ok: true, value: event() });
  });
  it("rejects unknown event kind", () => {
    expect(invalid(checkDrillEvent({ ...event(), kind: "background-refresh" }))).toBe(true);
  });
  it("rejects invalid event reference", () => {
    expect(invalid(checkDrillEvent({ ...event(), runId: "" }))).toBe(true);
  });
  it("rejects a step event without step identity", () => {
    expect(invalid(checkDrillEvent({ ...event(), kind: "step-recorded" }))).toBe(true);
  });
  it("accepts a referenced step-recorded event", () => {
    expect(checkDrillEvent(event("event-1", { kind: "step-recorded", stepId: "step-1" })).ok).toBe(true);
  });
  it("rejects unrelated step identity for note events", () => {
    expect(invalid(checkDrillEvent({ ...event(), stepId: "step-1" }))).toBe(true);
  });
  it("rejects unknown event run", () => {
    expect(invalid(checkDrillDocument(document([run()], [], [event("event-1", { runId: "unknown" })])))).toBe(true);
  });
  it("rejects events before run creation", () => {
    expect(invalid(checkDrillDocument(document([run()], [], [event("event-1", { at: "2026-11-19T08:00:00Z" })])))).toBe(true);
  });
  it("rejects duplicate event IDs", () => {
    expect(invalid(checkDrillDocument(document([run()], [], [event(), event()])))).toBe(true);
  });
  it("rejects step event pointing to absent step", () => {
    expect(invalid(checkDrillDocument(document([run()], [], [event("event-1", { kind: "step-recorded", stepId: "step-1" })])))).toBe(true);
  });
  it("rejects cross-run step reference", () => {
    const runs = [run(), run("run-2")];
    const wrong = event("event-1", { runId: "run-2", kind: "step-recorded", stepId: "step-1" });
    expect(invalid(checkDrillDocument(document(runs, [step()], [wrong])))).toBe(true);
  });
  it("accepts matched step and event references", () => {
    const linked = event("event-1", { kind: "step-recorded", stepId: "step-1" });
    expect(checkDrillDocument(document([run()], [step()], [linked])).ok).toBe(true);
  });
  it("rejects unknown top-level schema", () => {
    expect(invalid(checkDrillDocument({ ...emptyDrillDocument(), schema: "future" }))).toBe(true);
  });
  it("rejects non-array collections", () => {
    expect(invalid(checkDrillDocument({ ...emptyDrillDocument(), steps: null }))).toBe(true);
  });
  it("rejects duplicate run IDs", () => {
    expect(invalid(checkDrillDocument(document([run(), run()])))).toBe(true);
  });
  it("accepts a complete locally recorded graph", () => {
    const linked = event("event-1", { kind: "step-recorded", stepId: "step-1" });
    expect(checkDrillDocument(document([run()], [step()], [linked])).ok).toBe(true);
  });
});

describe("manual operations and fail-closed transitions", () => {
  it("adds a run without mutating existing document", () => {
    const before = emptyDrillDocument();
    const result = addDrillRun(before, run());
    expect(result.ok).toBe(true);
    expect(before.runs).toHaveLength(0);
  });
  it("prevents duplicate run creation", () => {
    expect(addDrillRun(document(), run()).ok).toBe(false);
  });
  it("starts in draft mode without asserting readiness", () => {
    const result = addDrillRun(emptyDrillDocument(), run());
    expect(result.ok && result.value.runs[0]?.phase).toBe("draft");
    expect(drillContentReady()).toBe(false);
  });
  it("accepts manual draft to in-progress transition", () => {
    const result = changeDrillPhase(document(), "run-1", "in-progress");
    expect(result.ok && result.value.runs[0]?.phase).toBe("in-progress");
  });
  it("rejects draft directly to closed", () => {
    expect(changeDrillPhase(document(), "run-1", "closed").ok).toBe(false);
  });
  it("rejects a phase change on absent run", () => {
    expect(changeDrillPhase(document(), "not-here", "paused").ok).toBe(false);
  });
  it("rejects repeated same-phase transitions", () => {
    expect(changeDrillPhase(document(), "run-1", "draft").ok).toBe(false);
  });
  it("pauses an active rehearsal", () => {
    const result = changeDrillPhase(document([run("run-1", { phase: "in-progress" })]), "run-1", "paused");
    expect(result.ok && result.value.runs[0]?.phase).toBe("paused");
  });
  it("resumes a paused rehearsal", () => {
    const result = changeDrillPhase(document([run("run-1", { phase: "paused" })]), "run-1", "in-progress");
    expect(result.ok && result.value.runs[0]?.phase).toBe("in-progress");
  });
  it("allows closing an active rehearsal record", () => {
    expect(changeDrillPhase(document([run("run-1", { phase: "in-progress" })]), "run-1", "closed").ok).toBe(true);
  });
  it("permits reopening a closed record", () => {
    expect(changeDrillPhase(document([run("run-1", { phase: "closed" })]), "run-1", "in-progress").ok).toBe(true);
  });
  it("rejects step recording in draft", () => {
    expect(recordDrillStep(document(), step()).ok).toBe(false);
  });
  it("rejects step recording while paused", () => {
    expect(recordDrillStep(document([run("run-1", { phase: "paused" })]), step()).ok).toBe(false);
  });
  it("rejects step recording in closed record", () => {
    expect(recordDrillStep(document([run("run-1", { phase: "closed" })]), step()).ok).toBe(false);
  });
  it("allows a manual step on active record", () => {
    const result = recordDrillStep(document([run("run-1", { phase: "in-progress" })]), step());
    expect(result.ok && result.value.steps).toHaveLength(1);
  });
  it("preserves a fail observation", () => {
    const result = recordDrillStep(document([run("run-1", { phase: "in-progress" })]), step("step-1", { outcome: "fail" }));
    expect(result.ok && result.value.steps[0]?.outcome).toBe("fail");
  });
  it("preserves UNKNOWN observation", () => {
    const result = recordDrillStep(document([run("run-1", { phase: "in-progress" })]), step());
    expect(result.ok && result.value.steps[0]?.outcome).toBe("UNKNOWN");
  });
  it("rejects step with missing run reference", () => {
    expect(recordDrillStep(document([run("run-1", { phase: "in-progress" })]), step("step-1", { runId: "run-2" })).ok).toBe(false);
  });
  it("rejects duplicate step recording", () => {
    expect(recordDrillStep(document([run("run-1", { phase: "in-progress" })], [step()]), step()).ok).toBe(false);
  });
  it("appends user-directed note events", () => {
    const result = appendDrillEvent(document(), event());
    expect(result.ok && result.value.events).toHaveLength(1);
  });
  it("rejects duplicate event creation", () => {
    expect(appendDrillEvent(document([run()], [], [event()]), event()).ok).toBe(false);
  });
  it("rejects event for unknown run", () => {
    expect(appendDrillEvent(document(), event("event-1", { runId: "bad" })).ok).toBe(false);
  });
});

describe("filtering, ordering and summaries", () => {
  const sample = document([
    run("run-2", { packId: "pack-b", kind: "handoff", phase: "closed", title: "Manual handoff", condition: "offline" }),
    run("run-1", { phase: "in-progress", title: "Inventory test" }),
    run("run-3", { packId: "pack-b", kind: "export", phase: "paused", title: "Export problem" }),
  ], [
    step("step-2", { runId: "run-2", outcome: "fail" }),
    step("step-1", { outcome: "UNKNOWN" }),
    step("step-3", { runId: "run-3", outcome: "not-run" }),
  ], [event()]);
  it("summarizes three run records", () => {
    expect(summarizeDrills(sample).runs).toBe(3);
  });
  it("counts distinct pack IDs", () => {
    expect(summarizeDrills(sample).distinctPacks).toBe(2);
  });
  it("counts active and paused separately", () => {
    expect(summarizeDrills(sample)).toMatchObject({ active: 1, paused: 1, closed: 1 });
  });
  it("counts recorded failures", () => {
    expect(summarizeDrills(sample).failed).toBe(1);
  });
  it("does not conflate UNKNOWN with not-run", () => {
    expect(summarizeDrills(sample)).toMatchObject({ unknown: 1, notRun: 1 });
  });
  it("does not present the summary as pack readiness", () => {
    expect(summarizeDrills(sample).contentReady).toBe(false);
  });
  it("filters by explicit pack identity", () => {
    expect(filterDrillRuns(sample, { packId: "pack-b" })).toHaveLength(2);
  });
  it("filters by selected operation", () => {
    expect(filterDrillRuns(sample, { kind: "handoff" }).map((item) => item.id)).toEqual(["run-2"]);
  });
  it("filters by selected phase", () => {
    expect(filterDrillRuns(sample, { phase: "paused" }).map((item) => item.id)).toEqual(["run-3"]);
  });
  it("filters by selected condition", () => {
    expect(filterDrillRuns(sample, { condition: "offline" }).map((item) => item.id)).toEqual(["run-2"]);
  });
  it("filters by case-insensitive title", () => {
    expect(filterDrillRuns(sample, { query: "INVENTORY" }).map((item) => item.id)).toEqual(["run-1"]);
  });
  it("filters by source reference", () => {
    expect(filterDrillRuns(sample, { query: "local inspection" })).toHaveLength(3);
  });
  it("combines query and phase filters", () => {
    expect(filterDrillRuns(sample, { query: "export", phase: "paused" }).map((item) => item.id)).toEqual(["run-3"]);
  });
  it("returns empty selection for missing pack", () => {
    expect(filterDrillRuns(sample, { packId: "absent" })).toEqual([]);
  });
  it("filters steps to their associated run", () => {
    expect(stepsForDrill(sample, "run-2").map((item) => item.id)).toEqual(["step-2"]);
  });
  it("filters events to their associated run", () => {
    expect(eventsForDrill(sample, "run-1").map((item) => item.id)).toEqual(["event-1"]);
  });
  it("returns no steps for unknown run", () => {
    expect(stepsForDrill(sample, "missing")).toEqual([]);
  });
  it("creates unique next run ID after nonconsecutive identifiers", () => {
    expect(nextDrillId(sample, "run")).toBe("run-4");
  });
  it("avoids ID collisions when numbered names are occupied", () => {
    expect(nextDrillId(document([run("run-2"), run("run-3")]), "run")).toBe("run-4");
  });
});

describe("bounded portable imports and conflict-safe merges", () => {
  it("serializes an empty document", () => {
    const output = serializeDrills(emptyDrillDocument());
    expect(output.ok).toBe(true);
    expect(output.ok && output.value).toContain("recovery-drill-run.v1");
  });
  it("round-trips a documented observation", () => {
    const before = document([run()], [step()], [event()]);
    const saved = serializeDrills(before);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(parseDrills(saved.value)).toEqual({ ok: true, value: before });
  });
  it("rejects malformed JSON", () => {
    expect(parseDrills("{").ok).toBe(false);
  });
  it("rejects an empty JSON object", () => {
    expect(parseDrills("{}").ok).toBe(false);
  });
  it("rejects oversized JSON input", () => {
    expect(parseDrills("x".repeat(DRILL_LIMITS.bytes + 1)).ok).toBe(false);
  });
  it("preserves source metadata after import", () => {
    const parsed = parseDrills(JSON.stringify(document()));
    expect(parsed.ok && parsed.value.runs[0]?.provenance.licence).toBe("Test licence");
  });
  it("previews newly supplied run identifiers", () => {
    expect(previewDrillMerge(document(), document([run(), run("run-2")])).newRuns).toBe(1);
  });
  it("previews shared run identifiers without changes", () => {
    expect(previewDrillMerge(document(), document()).existingRuns).toBe(1);
  });
  it("flags conflicting run identity", () => {
    expect(previewDrillMerge(document(), document([run("run-1", { title: "Different" })])).runConflicts).toBe(1);
  });
  it("previews newly supplied steps", () => {
    expect(previewDrillMerge(document(), document([run()], [step()])).newSteps).toBe(1);
  });
  it("flags conflicting observations", () => {
    const current = document([run()], [step()]);
    const incoming = document([run()], [step("step-1", { outcome: "pass" })]);
    expect(previewDrillMerge(current, incoming).stepConflicts).toBe(1);
  });
  it("previews new manual events", () => {
    expect(previewDrillMerge(document(), document([run()], [], [event()])).newEvents).toBe(1);
  });
  it("flags different notes sharing event identity", () => {
    const current = document([run()], [], [event()]);
    const incoming = document([run()], [], [event("event-1", { note: "Changed" })]);
    expect(previewDrillMerge(current, incoming).eventConflicts).toBe(1);
  });
  it("rejects conflicting imports", () => {
    const current = document([run()]);
    const incoming = document([run("run-1", { title: "Different" })]);
    expect(mergeDrillDocuments(current, incoming)).toEqual({ ok: false, issue: "conflict" });
  });
  it("merges independent cases", () => {
    const merged = mergeDrillDocuments(document(), document([run("run-2")]));
    expect(merged.ok && merged.value.runs).toHaveLength(2);
  });
  it("keeps identical entries only once", () => {
    const merged = mergeDrillDocuments(document(), document());
    expect(merged.ok && merged.value.runs).toHaveLength(1);
  });
  it("keeps imported step links when associated run is also imported", () => {
    const merged = mergeDrillDocuments(document(), document([run("run-2")], [step("step-2", { runId: "run-2" })]));
    expect(merged.ok && merged.value.steps).toHaveLength(1);
  });
  it("refuses unlinked imported observation", () => {
    const incoming = document([], [step()]);
    expect(mergeDrillDocuments(emptyDrillDocument(), incoming).ok).toBe(false);
  });
  it("does not mutate the original document during merge", () => {
    const current = document();
    mergeDrillDocuments(current, document([run("run-2")]));
    expect(current.runs).toHaveLength(1);
  });
  it("does not mark records ready after import", () => {
    const merged = mergeDrillDocuments(document(), document([run("run-2")]));
    expect(merged.ok && summarizeDrills(merged.value).contentReady).toBe(false);
  });
});

describe("boundary and source-integrity regression cases", () => {
  it("rejects document whose run count exceeds the configured limit", () => {
    const records = Array.from({ length: DRILL_LIMITS.runs + 1 }, (_, i) => run(`record-${i}`));
    expect(checkDrillDocument(document(records)).ok).toBe(false);
  });
  it("accepts the final permitted number of runs", () => {
    const records = Array.from({ length: DRILL_LIMITS.runs }, (_, i) => run(`record-${i}`));
    expect(checkDrillDocument(document(records)).ok).toBe(true);
  });
  it("rejects adding a run once the limit is reached", () => {
    const records = Array.from({ length: DRILL_LIMITS.runs }, (_, i) => run(`record-${i}`));
    expect(addDrillRun(document(records), run("extra")).ok).toBe(false);
  });
  it("rejects a run with a path-like identifier", () => {
    expect(checkDrillRun({ ...run(), id: "../unsafe" }).ok).toBe(false);
  });
  it("rejects a run with a control character in its title", () => {
    expect(checkDrillRun({ ...run(), title: "x\u001f" }).ok).toBe(false);
  });
  it("rejects control characters in a step label", () => {
    expect(checkDrillStep({ ...step(), label: "step\u0008label" }).ok).toBe(false);
  });
  it("rejects an unsafe control character in an event note", () => {
    expect(checkDrillEvent({ ...event(), note: "note\u000btext" }).ok).toBe(false);
  });
  it("allows ordinary line breaks in observation notes", () => {
    expect(checkDrillStep({ ...step(), note: "first line\nsecond line" }).ok).toBe(true);
  });
  it("does not assign an unsupported condition from imported JSON", () => {
    const unsafe = { ...run(), condition: "accessible" };
    expect(parseDrills(JSON.stringify(document([unsafe as DrillRun]))).ok).toBe(false);
  });
  it("does not accept a missing source on imported events", () => {
    const unsafe = { ...event(), provenance: null };
    expect(parseDrills(JSON.stringify(document([run()], [], [unsafe as unknown as DrillEvent]))).ok).toBe(false);
  });
  it("does not accept a missing licence on imported steps", () => {
    const unsafe = { ...step(), provenance: { ...provenance, licence: "" } };
    expect(parseDrills(JSON.stringify(document([run()], [unsafe]))).ok).toBe(false);
  });
  it("does not accept event links across different packs and runs", () => {
    const runs = [run(), run("run-2", { packId: "pack-two" })];
    const steps = [step("step-1", { runId: "run-1" })];
    const wrong = event("event-1", { runId: "run-2", kind: "step-recorded", stepId: "step-1" });
    expect(checkDrillDocument(document(runs, steps, [wrong])).ok).toBe(false);
  });
  it("does not consider an unrelated pack's observation during filtering", () => {
    const records = document([run(), run("run-2", { packId: "pack-two" })]);
    expect(filterDrillRuns(records, { packId: "pack-one" }).map((item) => item.id)).toEqual(["run-1"]);
  });
  it("returns no events when a run was never referenced", () => {
    expect(eventsForDrill(document([run()], [], [event()]), "run-2")).toEqual([]);
  });
  it("does not mutate incoming records during preview", () => {
    const incoming = document([run("run-2")]);
    previewDrillMerge(document(), incoming);
    expect(incoming.runs).toHaveLength(1);
  });
  it("keeps all incoming provenance values after a clean merge", () => {
    const incoming = document([run("run-2", { provenance: { ...provenance, reference: "second-source" } })]);
    const result = mergeDrillDocuments(document(), incoming);
    expect(result.ok && result.value.runs[1]?.provenance.reference).toBe("second-source");
  });
  it("re-serializes without losing explicit UNKNOWN condition", () => {
    const encoded = serializeDrills(document());
    expect(encoded.ok && encoded.value).toContain('"condition": "UNKNOWN"');
  });
  it("keeps a blank document distinct from a completed drill", () => {
    const summary = summarizeDrills(emptyDrillDocument());
    expect(summary).toMatchObject({ runs: 0, steps: 0, closed: 0, contentReady: false });
  });
});
