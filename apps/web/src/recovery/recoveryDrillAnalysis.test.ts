import { describe, expect, it } from "vitest";
import {
  compareDrillPacks, createDrillReport, drillDailyRollups, drillFindings,
  drillNarrative, drillOperationRollups, drillPackRollups, drillSourceRollups,
  drillSuggestedReviews, reviewDrill,
} from "./recoveryDrillAnalysis";
import {
  emptyDrillDocument, type DrillDocument, type DrillEvent,
  type DrillProvenance, type DrillRun, type DrillStep,
} from "./recoveryDrillRun";
const now = "2026-11-20";
const at = "2026-11-20T12:00:00.000Z";
const late = "2026-11-20T13:00:00.000Z";
const source: DrillProvenance = { source: "Local manual note", licence: "Example open licence", retrievedOn: now, tier: "UNKNOWN", reference: "test-note" };
const run = (id = "run-1", change: Partial<DrillRun> = {}): DrillRun => ({
  id, packId: "pack-a", title: "Offline opening rehearsal", kind: "offline-open", phase: "in-progress",
  condition: "UNKNOWN", openedAt: at, provenance: source, ...change,
});
const step = (id = "step-1", change: Partial<DrillStep> = {}): DrillStep => ({
  id, runId: "run-1", label: "Attempt to open an offline file", outcome: "UNKNOWN",
  condition: "UNKNOWN", note: "Local observation only", recordedAt: late, provenance: source, ...change,
});
const event = (id = "event-1", change: Partial<DrillEvent> = {}): DrillEvent => ({
  id, runId: "run-1", kind: "note", at: late, note: "Review later", provenance: source, stepId: null, ...change,
});
const doc = (runs: readonly DrillRun[] = [], steps: readonly DrillStep[] = [], events: readonly DrillEvent[] = []): DrillDocument => ({
  ...emptyDrillDocument(), runs, steps, events,
});
const sample = doc([
  run(),
  run("run-2", { packId: "pack-b", phase: "closed", kind: "handoff", condition: "offline", provenance: { ...source, tier: "documented" } }),
  run("run-3", { phase: "paused", kind: "export", condition: "missing" }),
], [
  step(),
  step("step-2", { runId: "run-2", outcome: "fail", condition: "interrupted" }),
  step("step-3", { runId: "run-3", outcome: "pass", condition: "recovered" }),
], [event()]);

describe("manual drill finding analysis", () => {
  it("reports no findings for an empty document", () => {
    expect(drillFindings(emptyDrillDocument(), now)).toEqual([]);
  });
  it("flags unknown run condition", () => {
    expect(drillFindings(doc([run()]), now).map((finding) => finding.code)).toContain("UNKNOWN-condition");
  });
  it("flags unknown source tier", () => {
    expect(drillFindings(doc([run()]), now).map((finding) => finding.code)).toContain("UNKNOWN-tier");
  });
  it("does not flag documented source as UNKNOWN tier", () => {
    const record = run("run-1", { provenance: { ...source, tier: "documented" } });
    expect(drillFindings(doc([record]), now).some((finding) => finding.code === "UNKNOWN-tier")).toBe(false);
  });
  it("flags self-reported sources for human review", () => {
    const record = run("run-1", { provenance: { ...source, tier: "self-reported" } });
    expect(drillFindings(doc([record]), now).map((finding) => finding.code)).toContain("unreviewed-source");
  });
  it("flags paused rehearsal cases", () => {
    expect(drillFindings(doc([run("run-1", { phase: "paused" })]), now).map((finding) => finding.code)).toContain("paused-case");
  });
  it("flags cases without recorded steps", () => {
    expect(drillFindings(doc([run()]), now).map((finding) => finding.code)).toContain("missing-steps");
  });
  it("does not flag missing steps when one was recorded", () => {
    expect(drillFindings(doc([run()], [step()]), now).some((finding) => finding.code === "missing-steps")).toBe(false);
  });
  it("flags an unresolved UNKNOWN step", () => {
    expect(drillFindings(doc([run()], [step()]), now).some((finding) => finding.code === "unresolved-outcome")).toBe(true);
  });
  it("flags a step marked not-run", () => {
    expect(drillFindings(doc([run()], [step("step-1", { outcome: "not-run" })]), now).some((finding) => finding.code === "unresolved-outcome")).toBe(true);
  });
  it("flags a failed observation with high priority", () => {
    const findings = drillFindings(doc([run()], [step("step-1", { outcome: "fail" })]), now);
    expect(findings.some((finding) => finding.code === "failed-step" && finding.severity === "high")).toBe(true);
  });
  it("does not treat a passing observation as failure", () => {
    expect(drillFindings(doc([run()], [step("step-1", { outcome: "pass" })]), now).some((finding) => finding.code === "failed-step")).toBe(false);
  });
  it("flags two opposite outcomes for identical step labels", () => {
    const steps = [step("step-1", { outcome: "pass" }), step("step-2", { outcome: "fail" })];
    expect(drillFindings(doc([run()], steps), now).some((finding) => finding.code === "contradictory-outcomes")).toBe(true);
  });
  it("does not treat different step labels as contradictory", () => {
    const steps = [step("step-1", { outcome: "pass" }), step("step-2", { label: "Other step", outcome: "fail" })];
    expect(drillFindings(doc([run()], steps), now).some((finding) => finding.code === "contradictory-outcomes")).toBe(false);
  });
  it("normalizes label case for contradiction detection", () => {
    const steps = [step("step-1", { outcome: "pass" }), step("step-2", { label: "ATTEMPT TO OPEN AN OFFLINE FILE", outcome: "fail" })];
    expect(drillFindings(doc([run()], steps), now).some((finding) => finding.code === "contradictory-outcomes")).toBe(true);
  });
  it("flags closed rehearsals without a passing observation", () => {
    const record = run("run-1", { phase: "closed" });
    expect(drillFindings(doc([record], [step("step-1", { outcome: "fail" })]), now).map((finding) => finding.code)).toContain("recovery-not-confirmed");
  });
  it("retains not-ready state even when a passing step exists", () => {
    const findings = drillFindings(doc([run()], [step("step-1", { outcome: "pass" })]), now);
    expect(findings.every((finding) => finding.contentReady === false)).toBe(true);
  });
  it("flags retrieval dates older than 180 days", () => {
    const old = run("run-1", { provenance: { ...source, retrievedOn: "2025-01-01" } });
    expect(drillFindings(doc([old]), now).some((finding) => finding.code === "stale-retrieval")).toBe(true);
  });
  it("does not flag same-day provenance as stale", () => {
    expect(drillFindings(doc([run()]), now).some((finding) => finding.code === "stale-retrieval")).toBe(false);
  });
  it("flags old step provenance", () => {
    const old = step("step-1", { provenance: { ...source, retrievedOn: "2024-01-01" } });
    expect(drillFindings(doc([run()], [old]), now).some((finding) => finding.code === "stale-retrieval" && finding.stepId === "step-1")).toBe(true);
  });
  it("flags post-close observations without a reopen event", () => {
    const closed = event("event-1", { kind: "closed", at: "2026-11-20T12:15:00.000Z" });
    expect(drillFindings(doc([run()], [step()], [closed]), now).some((finding) => finding.code === "step-after-close")).toBe(true);
  });
  it("does not flag a step when a later reopen is recorded", () => {
    const close = event("event-1", { kind: "closed", at: "2026-11-20T12:15:00.000Z" });
    const reopen = event("event-2", { kind: "reopened", at: "2026-11-20T12:30:00.000Z" });
    expect(drillFindings(doc([run()], [step()], [close, reopen]), now).some((finding) => finding.code === "step-after-close")).toBe(false);
  });
  it("flags an event referring to a step recorded later", () => {
    const earlier = event("event-1", { kind: "step-recorded", stepId: "step-1", at: "2026-11-20T12:10:00.000Z" });
    expect(drillFindings(doc([run()], [step()], [earlier]), now).some((finding) => finding.code === "event-before-step")).toBe(true);
  });
  it("sorts high-severity findings first", () => {
    const findings = drillFindings(doc([run()], [step("step-1", { outcome: "fail" })]), now);
    expect(findings[0]?.severity).toBe("high");
  });
  it("does not mark an investigation as authorizing content use", () => {
    expect(drillFindings(sample, now).every((finding) => !finding.contentReady)).toBe(true);
  });
});

describe("per-run reviews and pack rollups", () => {
  it("returns null when requested run is missing", () => {
    expect(reviewDrill(sample, "absent", now)).toBeNull();
  });
  it("counts associated steps for one run", () => {
    expect(reviewDrill(sample, "run-1", now)?.steps).toBe(1);
  });
  it("counts failed steps for one run", () => {
    expect(reviewDrill(sample, "run-2", now)?.failed).toBe(1);
  });
  it("counts unknown steps for one run", () => {
    expect(reviewDrill(sample, "run-1", now)?.unknown).toBe(1);
  });
  it("counts passing steps for one run", () => {
    expect(reviewDrill(sample, "run-3", now)?.passed).toBe(1);
  });
  it("returns the earliest recorded timestamp", () => {
    expect(reviewDrill(sample, "run-1", now)?.firstRecorded).toBe(at);
  });
  it("returns latest step timestamp", () => {
    expect(reviewDrill(sample, "run-1", now)?.latestRecorded).toBe(late);
  });
  it("never presents reviewed drills as usable packs", () => {
    expect(reviewDrill(sample, "run-1", now)?.contentReady).toBe(false);
  });
  it("groups packs by their identifier", () => {
    expect(drillPackRollups(sample).map((item) => item.packId)).toEqual(["pack-a", "pack-b"]);
  });
  it("counts runs within one pack", () => {
    expect(drillPackRollups(sample)[0]?.drills).toBe(2);
  });
  it("counts unresolved cases within a pack", () => {
    expect(drillPackRollups(sample)[0]?.unresolved).toBe(2);
  });
  it("does not mark the closed case as unresolved", () => {
    expect(drillPackRollups(sample)[1]?.unresolved).toBe(0);
  });
  it("includes the observed failed step", () => {
    expect(drillPackRollups(sample)[1]?.failed).toBe(1);
  });
  it("tracks multiple distinct observed conditions", () => {
    expect(drillPackRollups(sample)[0]?.conditions).toContain("recovered");
  });
  it("preserves UNKNOWN condition in group", () => {
    expect(drillPackRollups(sample)[0]?.conditions).toContain("UNKNOWN");
  });
  it("preserves documented source tier without upgrading it", () => {
    expect(drillPackRollups(sample)[1]?.tiers).toContain("documented");
  });
  it("preserves UNKNOWN source tier", () => {
    expect(drillPackRollups(sample)[0]?.tiers).toContain("UNKNOWN");
  });
  it("returns no groups for an empty document", () => {
    expect(drillPackRollups(emptyDrillDocument())).toEqual([]);
  });
});

describe("provenance, daily trends and operation groups", () => {
  it("groups exact matching provenance records", () => {
    expect(drillSourceRollups(sample).some((item) => item.runs.length === 2)).toBe(true);
  });
  it("keeps the original source licence", () => {
    expect(drillSourceRollups(sample).every((item) => item.provenance.licence === "Example open licence")).toBe(true);
  });
  it("counts provenance events separately", () => {
    expect(drillSourceRollups(sample).reduce((sum, item) => sum + item.events, 0)).toBe(1);
  });
  it("groups documents with an identical tier", () => {
    expect(drillSourceRollups(sample).some((item) => item.provenance.tier === "UNKNOWN")).toBe(true);
  });
  it("does not fabricate sources when no entries exist", () => {
    expect(drillSourceRollups(emptyDrillDocument())).toEqual([]);
  });
  it("records daily opening counts", () => {
    expect(drillDailyRollups(sample)[0]?.opened).toBe(3);
  });
  it("records daily step counts", () => {
    expect(drillDailyRollups(sample)[0]?.steps).toBe(3);
  });
  it("records daily event counts", () => {
    expect(drillDailyRollups(sample)[0]?.events).toBe(1);
  });
  it("counts failed outcomes by day", () => {
    expect(drillDailyRollups(sample)[0]?.failed).toBe(1);
  });
  it("counts UNKNOWN outcomes by day", () => {
    expect(drillDailyRollups(sample)[0]?.unknown).toBe(1);
  });
  it("orders trend days chronologically", () => {
    const earlier = run("run-4", { openedAt: "2026-11-18T12:00:00.000Z" });
    expect(drillDailyRollups(doc([...sample.runs, earlier], sample.steps)).map((day) => day.day)).toEqual(["2026-11-18", now]);
  });
  it("returns empty trends when no records exist", () => {
    expect(drillDailyRollups(emptyDrillDocument())).toEqual([]);
  });
  it("preserves all five operation categories", () => {
    expect(drillOperationRollups(emptyDrillDocument()).map((item) => item.kind)).toEqual(["inventory", "offline-open", "interruption", "handoff", "export"]);
  });
  it("counts one offline opening drill", () => {
    expect(drillOperationRollups(sample).find((item) => item.kind === "offline-open")?.runs).toBe(1);
  });
  it("counts one closed handoff", () => {
    expect(drillOperationRollups(sample).find((item) => item.kind === "handoff")?.closed).toBe(1);
  });
  it("counts failed handoff steps", () => {
    expect(drillOperationRollups(sample).find((item) => item.kind === "handoff")?.failed).toBe(1);
  });
  it("returns no runs for an unused operation", () => {
    expect(drillOperationRollups(sample).find((item) => item.kind === "inventory")?.runs).toBe(0);
  });
});

describe("manual follow-up priorities and comparisons", () => {
  it("creates an investigation for UNKNOWN observations", () => {
    expect(drillSuggestedReviews(sample, now).some((action) => action.runId === "run-1")).toBe(true);
  });
  it("prioritizes failed observations", () => {
    expect(drillSuggestedReviews(sample, now)[0]?.priority).toBe("high");
  });
  it("includes reasons for human review", () => {
    expect(drillSuggestedReviews(sample, now).every((action) => action.reasonCodes.length > 0)).toBe(true);
  });
  it("does not claim an action makes packs ready", () => {
    expect(drillSuggestedReviews(sample, now).every((action) => action.contentReady === false)).toBe(true);
  });
  it("does not schedule actions in an empty document", () => {
    expect(drillSuggestedReviews(emptyDrillDocument(), now)).toEqual([]);
  });
  it("includes all packs in report", () => {
    expect(createDrillReport(sample, now).packs).toHaveLength(2);
  });
  it("returns all review groups", () => {
    expect(createDrillReport(sample, now).reviews).toHaveLength(3);
  });
  it("never assigns report content readiness", () => {
    expect(createDrillReport(sample, now).contentReady).toBe(false);
  });
  it("preserves the report date", () => {
    expect(createDrillReport(sample, now).asOf).toBe(now);
  });
  it("reports new run IDs by pack", () => {
    const left = doc([run()]);
    const right = doc([run(), run("run-2")]);
    expect(compareDrillPacks(left, right, "pack-a").addedRunIds).toEqual(["run-2"]);
  });
  it("reports removed run IDs by pack", () => {
    expect(compareDrillPacks(doc([run()]), emptyDrillDocument(), "pack-a").removedRunIds).toEqual(["run-1"]);
  });
  it("reports changed run observations", () => {
    expect(compareDrillPacks(doc([run()]), doc([run("run-1", { title: "Changed" })]), "pack-a").changedRunIds).toEqual(["run-1"]);
  });
  it("reports a new step ID on same pack", () => {
    expect(compareDrillPacks(doc([run()]), doc([run()], [step()]), "pack-a").addedStepIds).toEqual(["step-1"]);
  });
  it("reports a changed step outcome on same pack", () => {
    const left = doc([run()], [step()]);
    const right = doc([run()], [step("step-1", { outcome: "fail" })]);
    expect(compareDrillPacks(left, right, "pack-a").changedStepIds).toEqual(["step-1"]);
  });
  it("ignores unrelated pack records", () => {
    const left = doc([run()]);
    const right = doc([run(), run("run-2", { packId: "pack-b" })]);
    expect(compareDrillPacks(left, right, "pack-a").addedRunIds).toEqual([]);
  });
  it("does not claim pack readiness after comparison", () => {
    expect(compareDrillPacks(doc([run()]), doc([run()]), "pack-a").contentReady).toBe(false);
  });
  it("includes explicit UNKNOWN in English narrative", () => {
    expect(drillNarrative(sample, now, "en")).toContain("UNKNOWN");
  });
  it("includes explicit UNKNOWN in French narrative", () => {
    expect(drillNarrative(sample, now, "fr")).toContain("UNKNOWN");
  });
  it("includes an English non-readiness warning", () => {
    expect(drillNarrative(sample, now, "en")).toContain("does not confirm");
  });
  it("includes a French non-readiness warning", () => {
    expect(drillNarrative(sample, now, "fr")).toContain("ne confirme pas");
  });
  it("uses French nonbreaking colon spacing", () => {
    expect(drillNarrative(sample, now, "fr")).toContain("\u00a0:");
  });
});
