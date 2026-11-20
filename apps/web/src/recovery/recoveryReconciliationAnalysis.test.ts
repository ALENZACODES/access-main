import { describe, expect, it } from "vitest";
import {
  compareReconciliationDocuments, reconciliationDailyCounts,
  reconciliationDateRange, reconciliationFindings, reconciliationPackGroups,
  reconciliationReport, reconciliationReviewIsAuthority, reconciliationReviewSteps,
  reconciliationSourceGroups, reconciliationTextReport, reconciliationTimeline,
} from "./recoveryReconciliationAnalysis";
import {
  newReconciliationDocument, type ReconciliationCase,
  type ReconciliationDocument, type ReconciliationEvent, type ReconciliationObservation,
} from "./recoveryReconciliation";

const source = { name: "Example", licence: "Example licence", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const, reference: "local" };
const earlier = "2026-11-19T08:00:00.000Z";
const middle = "2026-11-19T09:00:00.000Z";
const later = "2026-11-19T10:00:00.000Z";
const c = (id: string, changes: Partial<ReconciliationCase> = {}): ReconciliationCase => ({
  id, packId: "region-a", operation: "pack", status: "open", disposition: "UNKNOWN",
  openedAt: earlier, title: "Manual concern", summary: "No physical state inferred", source, ...changes,
});
const o = (id: string, caseId = "case-1", changes: Partial<ReconciliationObservation> = {}): ReconciliationObservation => ({
  id, caseId, condition: "UNKNOWN", recordedAt: middle, note: "Observed locally", source, ...changes,
});
const e = (id: string, caseId = "case-1", changes: Partial<ReconciliationEvent> = {}): ReconciliationEvent => ({
  id, caseId, action: "noted", at: later, note: "Review note", source, ...changes,
});
const d = (cases: ReconciliationCase[] = [], observations: ReconciliationObservation[] = [], events: ReconciliationEvent[] = []): ReconciliationDocument => ({
  ...newReconciliationDocument(), cases, observations, events,
});
const sample = d([
  c("case-1"),
  c("case-2", { packId: "region-b", operation: "handoff", status: "in-review", source: { ...source, tier: "documented", reference: "document-a" } }),
  c("case-3", { operation: "export", status: "closed", disposition: "retain" }),
], [o("obs-1"), o("obs-2", "case-3", { condition: "incomplete" })], [e("evt-1")]);

describe("reconciliation pack grouping", () => {
  it("returns no groups for empty documents", () => {
    expect(reconciliationPackGroups(d())).toEqual([]);
  });
  it("sorts pack groups by identifier", () => {
    expect(reconciliationPackGroups(sample).map((g) => g.packId)).toEqual(["region-a", "region-b"]);
  });
  it("counts grouped cases", () => {
    expect(reconciliationPackGroups(sample)[0]?.cases).toBe(2);
  });
  it("counts grouped observations", () => {
    expect(reconciliationPackGroups(sample)[0]?.observations).toBe(2);
  });
  it("counts outstanding cases", () => {
    expect(reconciliationPackGroups(sample)[0]?.open).toBe(1);
  });
  it("counts closed case records", () => {
    expect(reconciliationPackGroups(sample)[0]?.closed).toBe(1);
  });
  it("reports unknown conditions without upgrading", () => {
    expect(reconciliationPackGroups(sample)[1]?.unknown).toBe(1);
  });
  it("groups operation kinds", () => {
    expect(reconciliationPackGroups(sample)[0]?.operations).toEqual(["export", "pack"]);
  });
  it("groups distinct conditions", () => {
    expect(reconciliationPackGroups(sample)[0]?.conditions).toEqual(["incomplete", "UNKNOWN"]);
  });
  it("groups source tiers", () => {
    expect(reconciliationPackGroups(sample)[1]?.sourceTiers).toEqual(["documented"]);
  });
  it("does not infer pack readiness from groups", () => {
    expect(reconciliationPackGroups(sample).every((g) => g.contentReady === false)).toBe(true);
  });
  it("identifies contradictions within a case", () => {
    const conflicting = d([c("case-1")], [o("obs-1"), o("obs-2", "case-1", { condition: "interrupted" })]);
    expect(reconciliationPackGroups(conflicting)[0]?.contradictions).toBe(1);
  });
  it("does not call observations in unrelated cases contradictions", () => {
    const unrelated = d([c("case-1"), c("case-2")], [o("obs-1"), o("obs-2", "case-2", { condition: "interrupted" })]);
    expect(reconciliationPackGroups(unrelated)[0]?.contradictions).toBe(0);
  });
});

describe("reconciliation issue classification", () => {
  it("does not invent findings without cases", () => {
    expect(reconciliationFindings(d(), "2026-11-19")).toEqual([]);
  });
  it("flags missing observations", () => {
    expect(reconciliationFindings(d([c("case-1")]), "2026-11-19").map((f) => f.code)).toContain("no-observations");
  });
  it("flags unknown conditions", () => {
    expect(reconciliationFindings(d([c("case-1")], [o("obs-1")]), "2026-11-19").map((f) => f.code)).toContain("unknown-condition");
  });
  it("flags unknown evidence tier", () => {
    expect(reconciliationFindings(d([c("case-1")]), "2026-11-19").map((f) => f.code)).toContain("unknown-tier");
  });
  it("does not flag fully documented tiers", () => {
    const withTier = c("case-1", { source: { ...source, tier: "documented" } });
    expect(reconciliationFindings(d([withTier]), "2026-11-19").map((f) => f.code)).not.toContain("unknown-tier");
  });
  it("flags contradictory observation conditions", () => {
    const conflict = d([c("case-1")], [o("obs-1"), o("obs-2", "case-1", { condition: "incomplete" })]);
    expect(reconciliationFindings(conflict, "2026-11-19").map((f) => f.code)).toContain("contradiction");
  });
  it("prioritizes contradictory observations", () => {
    const conflict = d([c("case-1")], [o("obs-1"), o("obs-2", "case-1", { condition: "incomplete" })]);
    expect(reconciliationFindings(conflict, "2026-11-19")[0]?.priority).toBe("high");
  });
  it("flags closed cases without observations", () => {
    const closed = d([c("case-1", { status: "closed", disposition: "retain" })]);
    expect(reconciliationFindings(closed, "2026-11-19").map((f) => f.code)).toContain("closed-unresolved");
  });
  it("does not flag closed cases with one non-unknown observation as unresolved", () => {
    const closed = d([c("case-1", { status: "closed", disposition: "retain" })], [o("obs-1", "case-1", { condition: "incomplete" })]);
    expect(reconciliationFindings(closed, "2026-11-19").map((f) => f.code)).not.toContain("closed-unresolved");
  });
  it("flags review without an activity entry", () => {
    const reviewed = d([c("case-1", { status: "in-review" })]);
    expect(reconciliationFindings(reviewed, "2026-11-19").map((f) => f.code)).toContain("missing-review");
  });
  it("accepts a documented review activity", () => {
    const reviewed = d([c("case-1", { status: "in-review" })], [o("obs-1")], [e("evt-1", "case-1", { action: "reviewed" })]);
    expect(reconciliationFindings(reviewed, "2026-11-19").map((f) => f.code)).not.toContain("missing-review");
  });
  it("flags non-open cases with no activity", () => {
    const deferred = d([c("case-1", { status: "deferred" })]);
    expect(reconciliationFindings(deferred, "2026-11-19").map((f) => f.code)).toContain("missing-recent-event");
  });
  it("flags multiple source references", () => {
    const multiple = d([c("case-1")], [o("obs-1", "case-1", { source: { ...source, reference: "other" } })]);
    expect(reconciliationFindings(multiple, "2026-11-19").map((f) => f.code)).toContain("multiple-sources");
  });
  it("does not conflate duplicate source references with multiple sources", () => {
    expect(reconciliationFindings(d([c("case-1")], [o("obs-1")]), "2026-11-19").map((f) => f.code)).not.toContain("multiple-sources");
  });
  it("marks prior-year source dates for manual review", () => {
    const old = d([c("case-1", { source: { ...source, retrievedOn: "2025-04-01" } })]);
    expect(reconciliationFindings(old, "2026-11-19").map((f) => f.code)).toContain("dated-source");
  });
  it("does not flag same-year retrieval dates", () => {
    expect(reconciliationFindings(d([c("case-1")]), "2026-11-19").map((f) => f.code)).not.toContain("dated-source");
  });
  it("keeps finding output devoid of pack approval", () => {
    expect(reconciliationFindings(sample, "2026-11-19").every((f) => f.contentReady === false)).toBe(true);
  });
});

describe("provenance, chronology and comparisons", () => {
  it("groups identical sources", () => {
    expect(reconciliationSourceGroups(sample).some((group) => group.caseIds.length === 2)).toBe(true);
  });
  it("retains the licence in source groups", () => {
    expect(reconciliationSourceGroups(sample).every((group) => group.source.licence === "Example licence")).toBe(true);
  });
  it("separates source references", () => {
    expect(reconciliationSourceGroups(sample)).toHaveLength(2);
  });
  it("includes observation identifiers in source groups", () => {
    expect(reconciliationSourceGroups(sample).some((group) => group.observationIds.includes("obs-1"))).toBe(true);
  });
  it("includes event identifiers in source groups", () => {
    expect(reconciliationSourceGroups(sample).some((group) => group.eventIds.includes("evt-1"))).toBe(true);
  });
  it("never infers readiness from source counts", () => {
    expect(reconciliationSourceGroups(sample).every((group) => !group.contentReady)).toBe(true);
  });
  it("gives an empty timeline for empty documents", () => {
    expect(reconciliationTimeline(d())).toEqual([]);
  });
  it("orders timeline events by timestamp", () => {
    expect(reconciliationTimeline(sample).map((x) => x.kind)).toEqual(["case", "case", "case", "observation", "observation", "event"]);
  });
  it("restricts timeline to a selected case", () => {
    expect(reconciliationTimeline(sample, "case-2")).toHaveLength(1);
  });
  it("keeps a case creation condition UNKNOWN", () => {
    expect(reconciliationTimeline(sample, "case-1")[0]?.condition).toBe("UNKNOWN");
  });
  it("preserves observation conditions in chronology", () => {
    expect(reconciliationTimeline(sample, "case-3").find((x) => x.kind === "observation")?.condition).toBe("incomplete");
  });
  it("returns null date bounds for empty documents", () => {
    expect(reconciliationDateRange(d())).toEqual({ firstCase: null, latestCase: null, firstObservation: null, latestObservation: null, lastEvent: null, earliestSource: null, latestSource: null });
  });
  it("includes first case timestamp", () => {
    expect(reconciliationDateRange(sample).firstCase).toBe(earlier);
  });
  it("includes latest observation timestamp", () => {
    expect(reconciliationDateRange(sample).latestObservation).toBe(middle);
  });
  it("includes last activity timestamp", () => {
    expect(reconciliationDateRange(sample).lastEvent).toBe(later);
  });
  it("includes source retrieval dates", () => {
    expect(reconciliationDateRange(sample).earliestSource).toBe("2026-11-19");
  });
  it("counts activity on the appropriate day", () => {
    expect(reconciliationDailyCounts(sample)[0]?.events).toBe(1);
  });
  it("counts cases opened on a day", () => {
    expect(reconciliationDailyCounts(sample)[0]?.cases).toBe(3);
  });
  it("counts observations entered on a day", () => {
    expect(reconciliationDailyCounts(sample)[0]?.observations).toBe(2);
  });
  it("counts affected cases once on a day", () => {
    expect(reconciliationDailyCounts(sample)[0]?.changedCases).toBe(3);
  });
  it("sorts days chronologically", () => {
    const more = d([c("case-1"), c("case-2", { openedAt: "2026-11-17T08:00:00.000Z" })]);
    expect(reconciliationDailyCounts(more).map((x) => x.day)).toEqual(["2026-11-17", "2026-11-19"]);
  });
  it("compares added cases", () => {
    expect(compareReconciliationDocuments(d(), sample).filter((x) => x.change === "added")).toHaveLength(3);
  });
  it("compares removed cases", () => {
    expect(compareReconciliationDocuments(sample, d()).filter((x) => x.change === "removed")).toHaveLength(3);
  });
  it("compares unchanged cases", () => {
    expect(compareReconciliationDocuments(sample, sample).every((x) => x.change === "same")).toBe(true);
  });
  it("compares changed case statuses", () => {
    const before = d([c("case-1")]);
    const after = d([c("case-1", { status: "closed", disposition: "retain" })]);
    expect(compareReconciliationDocuments(before, after)[0]?.change).toBe("changed");
  });
  it("preserves absent status distinction", () => {
    expect(compareReconciliationDocuments(d(), sample)[0]?.statusBefore).toBe("ABSENT");
  });
  it("counts observation differences", () => {
    expect(compareReconciliationDocuments(d([c("case-1")]), d([c("case-1")], [o("obs-1")]))[0]?.observationChange).toBe(1);
  });
  it("counts activity differences", () => {
    expect(compareReconciliationDocuments(d([c("case-1")]), d([c("case-1")], [], [e("evt-1")]))[0]?.eventChange).toBe(1);
  });
  it("never claims comparison approves pack use", () => {
    expect(compareReconciliationDocuments(sample, sample).every((x) => x.contentReady === false)).toBe(true);
  });
});

describe("manual review guidance and reports", () => {
  it("creates steps for findings", () => {
    expect(reconciliationReviewSteps(sample, "2026-11-19").length).toBeGreaterThan(0);
  });
  it("provides a source for every review step", () => {
    expect(reconciliationReviewSteps(sample, "2026-11-19").every((step) => step.source.licence === "Example licence")).toBe(true);
  });
  it("does not authorize packs through review steps", () => {
    expect(reconciliationReviewSteps(sample, "2026-11-19").every((step) => !step.contentReady)).toBe(true);
  });
  it("counts every case in reports", () => {
    expect(reconciliationReport(sample, "2026-11-19").caseCount).toBe(3);
  });
  it("counts outstanding reviews in reports", () => {
    expect(reconciliationReport(sample, "2026-11-19").outstanding).toBe(2);
  });
  it("includes groups in reports", () => {
    expect(reconciliationReport(sample, "2026-11-19").groups).toHaveLength(2);
  });
  it("preserves the report date", () => {
    expect(reconciliationReport(sample, "2026-11-19").generatedAt).toBe("2026-11-19");
  });
  it("does not treat the report as pack authority", () => {
    expect(reconciliationReport(sample, "2026-11-19").contentReady).toBe(false);
  });
  it("includes UNKNOWN in English reports", () => {
    expect(reconciliationTextReport(sample, "2026-11-19", "en")).toContain("UNKNOWN");
  });
  it("includes UNKNOWN in French reports", () => {
    expect(reconciliationTextReport(sample, "2026-11-19", "fr")).toContain("UNKNOWN");
  });
  it("uses nonbreaking French colon space", () => {
    expect(reconciliationTextReport(sample, "2026-11-19", "fr")).toContain("\u00a0:");
  });
  it("states no pack approval in English", () => {
    expect(reconciliationTextReport(sample, "2026-11-19", "en")).toContain("No observation confirms");
  });
  it("states no pack approval in French", () => {
    expect(reconciliationTextReport(sample, "2026-11-19", "fr")).toContain("Aucune observation ne confirme");
  });
  it("keeps manual review distinct from authority", () => {
    expect(reconciliationReviewIsAuthority(sample)).toBe(false);
  });
});
