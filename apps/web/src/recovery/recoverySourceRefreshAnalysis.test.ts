import { describe, expect, it } from "vitest";
import {
  compareRefreshSubject, refreshAgeBuckets, refreshConflictPairs,
  refreshFindings, refreshNarrative, refreshPackOverviews, refreshReport,
  refreshReviewQueue, refreshTimeline, refreshTopicOverviews, sourceAgeDays,
} from "./recoverySourceRefreshAnalysis";
import {
  emptyRefreshDocument, type RefreshDocument, type RefreshObservation,
  type RefreshReview, type RefreshSubject,
} from "./recoverySourceRefresh";

const at = "2026-11-19T09:00:00.000Z";
const observed = "2026-11-19T10:00:00.000Z";
const source = { name: "Local evidence", licence: "Example licence", retrievedOn: "2026-11-15", tier: "UNKNOWN" as const, reference: "example-1" };
const subject = (id: string, changes: Partial<RefreshSubject> = {}): RefreshSubject => ({
  id, packId: "pack-a", topic: "content", title: `Evidence ${id}`, startedAt: at, ...changes,
});
const observation = (id: string, subjectId: string, changes: Partial<RefreshObservation> = {}): RefreshObservation => ({
  id, subjectId, observedAt: observed, condition: "UNKNOWN", source, note: "Manual note", ...changes,
});
const review = (id: string, subjectId: string, changes: Partial<RefreshReview> = {}): RefreshReview => ({
  id, subjectId, at: "2026-11-19T11:00:00.000Z", decision: "review-needed", note: "Request", ...changes,
});
const doc = (subjects: RefreshSubject[], observations: RefreshObservation[] = [], reviews: RefreshReview[] = []): RefreshDocument =>
  ({ ...emptyRefreshDocument(), subjects, observations, reviews });
const sample = doc([
  subject("a"), subject("b", { packId: "pack-b", topic: "integrity" }),
  subject("c", { packId: "pack-a", topic: "licence" }),
], [
  observation("o1", "a"),
  observation("o2", "b", { condition: "unavailable", source: { ...source, retrievedOn: "2026-01-01", tier: "documented", reference: "example-2" } }),
  observation("o3", "c", { condition: "available", source: { ...source, tier: "reviewed" } }),
], [review("r1", "a")]);
const options = { asOf: "2026-11-20", windowDays: 180 as const };

describe("user-selected source age and review windows", () => {
  it("reports elapsed calendar days", () => { expect(sourceAgeDays("2026-11-18", "2026-11-20")).toBe(2); });
  it("reports a same-day source as zero days old", () => { expect(sourceAgeDays("2026-11-20", "2026-11-20")).toBe(0); });
  it("reports a null age when source date is unavailable", () => { expect(sourceAgeDays(null, "2026-11-20")).toBeNull(); });
  it("reports a null age for impossible calendar dates", () => { expect(sourceAgeDays("2026-02-31", "2026-11-20")).toBeNull(); });
  it("does not accept an earlier reference day than the source date", () => { expect(sourceAgeDays("2026-11-21", "2026-11-20")).toBeNull(); });
  it("handles leap-day boundaries", () => { expect(sourceAgeDays("2024-02-28", "2024-03-01")).toBe(2); });
  it("handles a calendar year boundary", () => { expect(sourceAgeDays("2025-12-31", "2026-01-01")).toBe(1); });
  it("uses the requested review window", () => {
    expect(refreshFindings(sample, { asOf: "2026-11-20", windowDays: 30 }).some((f) => f.code === "older-than-window")).toBe(true);
  });
  it("does not claim that all reviewed data is usable", () => { expect(refreshReport(sample, options).contentReady).toBe(false); });
  it("returns a report with the user-selected day", () => { expect(refreshReport(sample, options).asOf).toBe(options.asOf); });
  it("returns a report with the selected window", () => { expect(refreshReport(sample, options).windowDays).toBe(180); });
  it("keeps the UNKNOWN age bucket explicit", () => {
    expect(refreshAgeBuckets(doc([subject("a")]), options)[0]).toMatchObject({ key: "UNKNOWN", count: 1 });
  });
  it("counts older-than-window sources separately", () => {
    expect(refreshAgeBuckets(sample, options).find((x) => x.key === "older-than-window")?.count).toBe(1);
  });
  it("counts current-window sources separately", () => {
    expect(refreshAgeBuckets(sample, options).find((x) => x.key === "current-window")?.count).toBe(2);
  });
  it("preserves every source subject across age buckets", () => {
    expect(refreshAgeBuckets(sample, options).reduce((sum, x) => sum + x.count, 0)).toBe(3);
  });
  it("does not elevate evidence tiers by date", () => {
    expect(refreshFindings(sample, options).some((f) => f.code === "unknown-tier" && f.subjectId === "a")).toBe(true);
  });
});

describe("manual findings and conflicting source observations", () => {
  it("shows no findings for an empty document", () => { expect(refreshFindings(emptyRefreshDocument(), options)).toEqual([]); });
  it("reports no-observation when nothing was recorded", () => {
    expect(refreshFindings(doc([subject("a")]), options).some((f) => f.code === "no-observation")).toBe(true);
  });
  it("reports age-unknown when no source exists", () => {
    expect(refreshFindings(doc([subject("a")]), options).some((f) => f.code === "age-unknown")).toBe(true);
  });
  it("reports UNKNOWN condition without translating it", () => {
    expect(refreshFindings(sample, options).some((f) => f.code === "unknown-condition" && f.subjectId === "a")).toBe(true);
  });
  it("reports unavailable source claims as high priority", () => {
    expect(refreshFindings(sample, options).find((f) => f.code === "unavailable")?.severity).toBe("high");
  });
  it("reports an older source against the selected window", () => {
    expect(refreshFindings(sample, options).some((f) => f.code === "older-than-window" && f.subjectId === "b")).toBe(true);
  });
  it("reports subjects without completed manual reviews", () => {
    expect(refreshFindings(sample, options).filter((f) => f.code === "unreviewed")).toHaveLength(3);
  });
  it("does not treat a review request as a completed review", () => {
    expect(refreshReviewQueue(sample, options).find((x) => x.subjectId === "a")?.manuallyReviewed).toBe(false);
  });
  it("returns no conflicts for a single observation", () => { expect(refreshConflictPairs([observation("o1", "a")])).toEqual([]); });
  it("does not treat repeated matching observations as conflicts", () => {
    expect(refreshConflictPairs([observation("o1", "a"), observation("o2", "a")])).toEqual([]);
  });
  it("does not treat UNKNOWN against a known condition as a contradiction", () => {
    expect(refreshConflictPairs([observation("o1", "a"), observation("o2", "a", { condition: "available" })])).toEqual([]);
  });
  it("does not flag different conditions from the same reference as independent conflicts", () => {
    expect(refreshConflictPairs([
      observation("o1", "a", { condition: "available" }),
      observation("o2", "a", { condition: "unavailable" }),
    ])).toEqual([]);
  });
  it("flags different conditions from independent source references", () => {
    expect(refreshConflictPairs([
      observation("o1", "a", { condition: "available" }),
      observation("o2", "a", { condition: "unavailable", source: { ...source, reference: "example-2" } }),
    ])).toEqual([["o1", "o2"]]);
  });
  it("includes conflicting observations in a manual queue", () => {
    const input = doc([subject("a")], [
      observation("o1", "a", { condition: "available" }),
      observation("o2", "a", { condition: "unavailable", source: { ...source, reference: "example-2" } }),
    ]);
    expect(refreshReviewQueue(input, options)[0]?.priority).toBe("high");
  });
  it("does not mark content ready after recording incompatible observations", () => {
    expect(refreshReport(sample, options).queue.every((x) => x.contentReady === false)).toBe(true);
  });
  it("never labels a source as externally approved", () => {
    expect(refreshNarrative(sample, options, "en")).not.toMatch(/approved|guaranteed|verified/i);
  });
});

describe("pack, topic, queue and history summaries", () => {
  it("returns an empty queue for no subjects", () => { expect(refreshReviewQueue(emptyRefreshDocument(), options)).toEqual([]); });
  it("returns one queue row per subject", () => { expect(refreshReviewQueue(sample, options)).toHaveLength(3); });
  it("prioritizes unavailable observations", () => { expect(refreshReviewQueue(sample, options)[0]?.subjectId).toBe("b"); });
  it("preserves the source age of the last observation", () => { expect(refreshReviewQueue(sample, options).find((x) => x.subjectId === "a")?.ageDays).toBe(5); });
  it("preserves the last retrieval date", () => { expect(refreshReviewQueue(sample, options).find((x) => x.subjectId === "a")?.lastRetrievedOn).toBe("2026-11-15"); });
  it("separates pack groupings", () => { expect(refreshPackOverviews(sample, options)).toHaveLength(2); });
  it("sorts pack groupings", () => { expect(refreshPackOverviews(sample, options).map((x) => x.packId)).toEqual(["pack-a", "pack-b"]); });
  it("counts unknown conditions per pack", () => { expect(refreshPackOverviews(sample, options)[0]?.unknown).toBe(1); });
  it("counts the high-priority pack", () => { expect(refreshPackOverviews(sample, options)[1]?.highPriority).toBe(1); });
  it("does not describe a pack as ready", () => { expect(refreshPackOverviews(sample, options).every((x) => x.contentReady === false)).toBe(true); });
  it("keeps all supported evidence topics", () => { expect(refreshTopicOverviews(sample)).toHaveLength(6); });
  it("counts records for the content topic", () => { expect(refreshTopicOverviews(sample).find((x) => x.topic === "content")?.total).toBe(1); });
  it("keeps empty topic groups", () => { expect(refreshTopicOverviews(sample).find((x) => x.topic === "handoff")?.total).toBe(0); });
  it("counts observations in daily timeline", () => { expect(refreshTimeline(sample)[0]?.observations).toBe(3); });
  it("counts reviews in daily timeline", () => { expect(refreshTimeline(sample)[0]?.reviews).toBe(1); });
  it("counts created subjects in daily timeline", () => { expect(refreshTimeline(sample)[0]?.subjects).toBe(3); });
  it("tracks added observation identifiers in a comparison", () => {
    const left = doc([subject("a")]);
    const right = doc([subject("a")], [observation("o1", "a")]);
    expect(compareRefreshSubject(left, right, "a").changes).toContain("added:o1");
  });
  it("tracks removed observation identifiers", () => {
    const left = doc([subject("a")], [observation("o1", "a")]);
    const right = doc([subject("a")]);
    expect(compareRefreshSubject(left, right, "a").changes).toContain("removed:o1");
  });
  it("tracks changed observation data", () => {
    const left = doc([subject("a")], [observation("o1", "a")]);
    const right = doc([subject("a")], [observation("o1", "a", { note: "Another note" })]);
    expect(compareRefreshSubject(left, right, "a").changes).toContain("changed:o1");
  });
  it("tracks subject metadata changes", () => {
    const left = doc([subject("a")]);
    const right = doc([subject("a", { title: "Other title" })]);
    expect(compareRefreshSubject(left, right, "a").changes).toContain("subject-changed");
  });
  it("keeps comparison readiness false", () => { expect(compareRefreshSubject(emptyRefreshDocument(), sample, "a").contentReady).toBe(false); });
  it("keeps the literal UNKNOWN token in English report", () => { expect(refreshNarrative(sample, options, "en")).toContain("UNKNOWN"); });
  it("keeps the literal UNKNOWN token in French report", () => { expect(refreshNarrative(sample, options, "fr")).toContain("UNKNOWN"); });
  it("uses nonbreaking spaces before French label colons", () => { expect(refreshNarrative(sample, options, "fr")).toContain("\u00a0:"); });
  it("explains review limitations in English", () => { expect(refreshNarrative(sample, options, "en")).toContain("does not establish"); });
  it("explains review limitations in French", () => { expect(refreshNarrative(sample, options, "fr")).toContain("ne confirme pas"); });
});

describe("later observations make earlier manual reviews out of date", () => {
  const reviewed = doc([subject("a")], [observation("o1", "a")], [
    review("r1", "a"), review("r2", "a", { at: "2026-11-19T12:00:00.000Z", decision: "reviewed" }),
  ]);
  const changed = doc(reviewed.subjects as RefreshSubject[], [
    observation("o1", "a"),
    observation("o2", "a", { observedAt: "2026-11-19T13:00:00.000Z", condition: "unavailable" }),
  ], reviewed.reviews as RefreshReview[]);
  it("shows the originally reviewed item as reviewed", () => { expect(refreshReviewQueue(reviewed, options)[0]?.manuallyReviewed).toBe(true); });
  it("shows the later observation as needing a new review", () => { expect(refreshReviewQueue(changed, options)[0]?.manuallyReviewed).toBe(false); });
  it("adds a review-needed finding for the later observation", () => { expect(refreshFindings(changed, options).some((f) => f.code === "unreviewed")).toBe(true); });
  it("counts the later observation as outstanding for the pack", () => { expect(refreshPackOverviews(changed, options)[0]?.outstanding).toBe(1); });
  it("does not change the stored review event", () => { expect(changed.reviews[changed.reviews.length - 1]?.decision).toBe("reviewed"); });
});
