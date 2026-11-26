import { describe, expect, it } from "vitest";
import {
  compareGuidedPacks, createGuidedReport, guidedDailyGroups, guidedFindings,
  guidedNarrative, guidedPackReviews, guidedReviewPlan, guidedSourceGroups,
  guidedTimeline, guidedTopicStatus,
} from "./recoveryGuidedAnalysis";
import { emptyGuidedDocument, type GuidedCase, type GuidedDocument, type GuidedEvent, type GuidedStep } from "./recoveryGuidedReview";
const source = { name: "Local source", licence: "Example licence", retrievedOn: "2026-11-19", reference: "sample", tier: "UNKNOWN" as const };
const a = (id = "case-1", change: Partial<GuidedCase> = {}): GuidedCase => ({
  id, packId: "pack-a", condition: "UNKNOWN", phase: "draft", title: "Review local storage",
  openedAt: "2026-11-20T10:00:00.000Z", source, ...change,
});
const s = (id = "step-1", change: Partial<GuidedStep> = {}): GuidedStep => ({
  id, caseId: "case-1", topic: "storage", evidence: "UNKNOWN", outcome: "UNKNOWN",
  note: "Manual check", capturedAt: "2026-11-20T10:10:00.000Z", source, ...change,
});
const e = (id = "event-1", change: Partial<GuidedEvent> = {}): GuidedEvent => ({
  id, caseId: "case-1", action: "note-added", at: "2026-11-20T10:15:00.000Z", note: "Manual note", stepId: null, ...change,
});
const document = (cases: GuidedCase[] = [], steps: GuidedStep[] = [], events: GuidedEvent[] = []): GuidedDocument => ({ ...emptyGuidedDocument(), cases, steps, events });
const sample = document([a(), a("case-2", { packId: "pack-b", condition: "storage" })], [s(), s("step-2", { caseId: "case-2", topic: "integrity", evidence: "disputed", outcome: "needs-action" })], [e()]);

describe("guided topic coverage", () => {
  it("returns one entry for each defined topic", () => {
    expect(guidedTopicStatus(emptyGuidedDocument(), "case-1")).toHaveLength(7);
  });
  it("does not infer evidence for missing topics", () => {
    expect(guidedTopicStatus(emptyGuidedDocument(), "case-1").every((t) => t.evidence === "not-recorded")).toBe(true);
  });
  it("counts a recorded observation", () => {
    expect(guidedTopicStatus(sample, "case-1").find((t) => t.topic === "storage")?.count).toBe(1);
  });
  it("preserves UNKNOWN instead of translating it", () => {
    expect(guidedTopicStatus(sample, "case-1").find((t) => t.topic === "storage")?.evidence).toBe("UNKNOWN");
  });
  it("recognizes a disputed observation", () => {
    expect(guidedTopicStatus(sample, "case-2").find((t) => t.topic === "integrity")?.hasDispute).toBe(true);
  });
  it("distinguishes missing topics from disputed ones", () => {
    expect(guidedTopicStatus(sample, "case-2").find((t) => t.topic === "storage")?.evidence).toBe("not-recorded");
  });
  it("never claims a pack is ready", () => {
    expect(guidedTopicStatus(sample, "case-1").every((t) => t.contentReady === false)).toBe(true);
  });
  it("keeps latest manual observation for display", () => {
    const d = document([a()], [s(), s("step-2", { evidence: "documented", capturedAt: "2026-11-20T10:20:00.000Z" })]);
    expect(guidedTopicStatus(d, "case-1").find((t) => t.topic === "storage")?.evidence).toBe("documented");
  });
  it("retains an older dispute for review", () => {
    const d = document([a()], [s("step-1", { evidence: "disputed" }), s("step-2", { evidence: "documented" })]);
    expect(guidedTopicStatus(d, "case-1").find((t) => t.topic === "storage")?.hasDispute).toBe(true);
  });
});

describe("guided findings and priorities", () => {
  it("reports no findings on an empty document", () => {
    expect(guidedFindings(emptyGuidedDocument(), "2026-11-20")).toEqual([]);
  });
  it("flags missing observations", () => {
    expect(guidedFindings(document([a()]), "2026-11-20").some((f) => f.code === "no-steps")).toBe(true);
  });
  it("flags unknown case condition", () => {
    expect(guidedFindings(sample, "2026-11-20").some((f) => f.code === "unknown-condition")).toBe(true);
  });
  it("flags unknown source tier", () => {
    expect(guidedFindings(sample, "2026-11-20").some((f) => f.code === "unknown-source")).toBe(true);
  });
  it("flags missing topics without fabricating values", () => {
    expect(guidedFindings(sample, "2026-11-20").filter((f) => f.code === "missing-topic").length).toBeGreaterThan(0);
  });
  it("flags explicitly UNKNOWN evidence", () => {
    expect(guidedFindings(sample, "2026-11-20").some((f) => f.code === "unknown-evidence")).toBe(true);
  });
  it("flags disputes as high priority", () => {
    expect(guidedFindings(sample, "2026-11-20").some((f) => f.code === "disputed" && f.priority === "high")).toBe(true);
  });
  it("flags manual action as high priority", () => {
    expect(guidedFindings(sample, "2026-11-20").some((f) => f.code === "needs-action" && f.priority === "high")).toBe(true);
  });
  it("does not invent priorities for empty documents", () => {
    expect(guidedReviewPlan(emptyGuidedDocument(), "2026-11-20")).toEqual([]);
  });
  it("puts high-priority disputes first", () => {
    expect(guidedReviewPlan(sample, "2026-11-20")[0]?.caseId).toBe("case-2");
  });
  it("groups related codes for one case", () => {
    expect(guidedReviewPlan(sample, "2026-11-20").find((f) => f.caseId === "case-1")?.codes).toContain("unknown-evidence");
  });
  it("does not mark a finding as ready", () => {
    expect(guidedFindings(sample, "2026-11-20").every((f) => f.contentReady === false)).toBe(true);
  });
  it("flags stale supplied provenance without changing dates", () => {
    expect(guidedFindings(sample, "2027-11-20").some((f) => f.code === "stale-source")).toBe(true);
  });
  it("does not mark current provenance stale", () => {
    expect(guidedFindings(sample, "2026-11-20").some((f) => f.code === "stale-source")).toBe(false);
  });
  it("flags review phase without claiming approval", () => {
    const d = document([a("case-1", { phase: "review" })]);
    expect(guidedFindings(d, "2026-11-20").some((f) => f.code === "open-review")).toBe(true);
  });
});

describe("guided pack summaries", () => {
  it("returns no rows for empty document", () => {
    expect(guidedPackReviews(emptyGuidedDocument())).toEqual([]);
  });
  it("returns separate rows per pack", () => {
    expect(guidedPackReviews(sample)).toHaveLength(2);
  });
  it("sorts pack summaries by identifier", () => {
    expect(guidedPackReviews(sample).map((p) => p.packId)).toEqual(["pack-a", "pack-b"]);
  });
  it("counts cases by pack", () => {
    expect(guidedPackReviews(sample)[0]?.cases).toBe(1);
  });
  it("counts related observations only", () => {
    expect(guidedPackReviews(sample)[0]?.steps).toBe(1);
  });
  it("counts disputes in their own pack", () => {
    expect(guidedPackReviews(sample)[1]?.disputed).toBe(1);
  });
  it("does not assign dispute to unrelated pack", () => {
    expect(guidedPackReviews(sample)[0]?.disputed).toBe(0);
  });
  it("does not mistake closed documentation for pack readiness", () => {
    expect(guidedPackReviews(sample).every((p) => p.contentReady === false)).toBe(true);
  });
  it("counts unknown condition and evidence separately", () => {
    expect(guidedPackReviews(sample)[0]?.unknown).toBe(2);
  });
  it("groups supplied provenance and its licence", () => {
    expect(guidedSourceGroups(sample)[0]?.licence).toBe("Example licence");
  });
  it("preserves supplied retrieval date", () => {
    expect(guidedSourceGroups(sample)[0]?.retrievalDate).toBe("2026-11-19");
  });
  it("counts identical sources together", () => {
    expect(guidedSourceGroups(sample)[0]?.cases).toBe(2);
  });
});

describe("guided daily activity and comparison", () => {
  it("returns no dates when nothing was recorded", () => {
    expect(guidedDailyGroups(emptyGuidedDocument())).toEqual([]);
  });
  it("counts created cases", () => {
    expect(guidedDailyGroups(sample)[0]?.casesOpened).toBe(2);
  });
  it("counts observations", () => {
    expect(guidedDailyGroups(sample)[0]?.observations).toBe(2);
  });
  it("counts manual review events", () => {
    expect(guidedDailyGroups(sample)[0]?.manualEvents).toBe(1);
  });
  it("sorts dates", () => {
    const d = document([a(), a("case-2", { openedAt: "2026-11-18T10:00:00.000Z" })]);
    expect(guidedDailyGroups(d).map((x) => x.day)).toEqual(["2026-11-18", "2026-11-20"]);
  });
  it("detects a new case", () => {
    const added = compareGuidedPacks(document([a()]), document([a(), a("case-2")]), "pack-a");
    expect(added.addedCases).toEqual(["case-2"]);
  });
  it("detects removed case without assuming its outcome", () => {
    const removed = compareGuidedPacks(document([a()]), emptyGuidedDocument(), "pack-a");
    expect(removed.removedCases).toEqual(["case-1"]);
    expect(removed.contentReady).toBe(false);
  });
  it("detects modified source without upgrading it", () => {
    const changed = compareGuidedPacks(document([a()]), document([a("case-1", { source: { ...source, tier: "documented" } })]), "pack-a");
    expect(changed.changedCases).toEqual(["case-1"]);
  });
  it("detects additional observation", () => {
    const diff = compareGuidedPacks(document([a()]), document([a()], [s()]), "pack-a");
    expect(diff.addedSteps).toEqual(["step-1"]);
  });
  it("ignores changes to other packs", () => {
    const diff = compareGuidedPacks(document([a()]), sample, "pack-a");
    expect(diff.addedCases).toEqual([]);
  });
  it("includes created case in timeline", () => {
    expect(guidedTimeline(sample, "case-1")[0]).toContain("opened");
  });
  it("includes manual evidence in timeline", () => {
    expect(guidedTimeline(sample, "case-1").some((x) => x.includes("storage"))).toBe(true);
  });
  it("returns empty timeline for unrelated case", () => {
    expect(guidedTimeline(sample, "missing")).toEqual([]);
  });
});

describe("guided bilingual report", () => {
  it("includes date in English", () => {
    expect(guidedNarrative(sample, "2026-11-20", "en")).toContain("2026-11-20");
  });
  it("includes date in French", () => {
    expect(guidedNarrative(sample, "2026-11-20", "fr")).toContain("2026-11-20");
  });
  it("preserves UNKNOWN in English report", () => {
    expect(guidedNarrative(sample, "2026-11-20", "en")).toContain("UNKNOWN");
  });
  it("preserves UNKNOWN in French report", () => {
    expect(guidedNarrative(sample, "2026-11-20", "fr")).toContain("UNKNOWN");
  });
  it("uses French no-break colon spacing", () => {
    expect(guidedNarrative(sample, "2026-11-20", "fr")).toContain("\u00a0:");
  });
  it("does not offer pack approval in English", () => {
    expect(guidedNarrative(sample, "2026-11-20", "en")).toContain("does not confirm");
  });
  it("does not offer pack approval in French", () => {
    expect(guidedNarrative(sample, "2026-11-20", "fr")).toContain("ne confirme jamais");
  });
  it("returns explicit review report with contentReady false", () => {
    expect(createGuidedReport(sample, "2026-11-20").contentReady).toBe(false);
  });
  it("includes every pack in the report", () => {
    expect(createGuidedReport(sample, "2026-11-20").packs).toHaveLength(2);
  });
});
