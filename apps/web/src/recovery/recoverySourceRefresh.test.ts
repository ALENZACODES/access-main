import { describe, expect, it } from "vitest";
import {
  REFRESH_CONDITIONS, REFRESH_DECISIONS, REFRESH_LIMITS, REFRESH_SCHEMA,
  REFRESH_TIERS, REFRESH_TOPICS, appendRefreshObservation, appendRefreshReview,
  appendRefreshSubject, checkRefreshDocument, checkRefreshObservation,
  checkRefreshReview, checkRefreshSource, checkRefreshSubject, emptyRefreshDocument,
  exportRefreshDocument, filterRefreshSubjects, latestRefreshObservation,
  latestRefreshReview, mergeRefreshDocuments, nextRefreshId, parseRefreshDocument,
  previewRefreshMerge, refreshCalendarDay, refreshContentReady, refreshInstant,
  refreshObservationsFor, refreshReviewsFor, refreshReviewCurrent, summarizeRefresh,
  type RefreshDocument, type RefreshObservation, type RefreshReview,
  type RefreshSubject,
} from "./recoverySourceRefresh";

const instant = "2026-11-20T10:00:00.000Z";
const later = "2026-11-20T11:00:00.000Z";
const latest = "2026-11-20T12:00:00.000Z";
const provenance = {
  name: "Local source", licence: "Sample open licence", retrievedOn: "2026-11-18",
  tier: "UNKNOWN" as const, reference: "local-record-a",
};
const subject = (id = "source-1", changes: Partial<RefreshSubject> = {}): RefreshSubject => ({
  id, packId: "pack-a", topic: "pack", title: "Local pack evidence", startedAt: instant,
  ...changes,
});
const observation = (id = "observation-1", changes: Partial<RefreshObservation> = {}): RefreshObservation => ({
  id, subjectId: "source-1", observedAt: later, condition: "UNKNOWN", source: provenance,
  note: "User observation only", ...changes,
});
const review = (id = "review-1", changes: Partial<RefreshReview> = {}): RefreshReview => ({
  id, subjectId: "source-1", at: latest, decision: "review-needed", note: "Follow up locally",
  ...changes,
});
const document = (
  subjects: readonly RefreshSubject[] = [subject()],
  observations: readonly RefreshObservation[] = [observation()],
  reviews: readonly RefreshReview[] = [],
): RefreshDocument => ({ schema: REFRESH_SCHEMA, subjects, observations, reviews });

describe("manual source refresh schema and provenance", () => {
  it("starts empty with an exact schema", () => {
    expect(emptyRefreshDocument()).toEqual({ schema: REFRESH_SCHEMA, subjects: [], observations: [], reviews: [] });
  });
  it("accepts a complete local observation", () => { expect(checkRefreshDocument(document())).toBe(true); });
  it("accepts an empty document", () => { expect(checkRefreshDocument(emptyRefreshDocument())).toBe(true); });
  it("rejects an unexpected root key", () => { expect(checkRefreshDocument({ ...document(), telemetry: true })).toBe(false); });
  it("rejects an unsupported schema", () => { expect(checkRefreshDocument({ ...document(), schema: "v2" })).toBe(false); });
  it("rejects arrays masquerading as a root", () => { expect(checkRefreshDocument([])).toBe(false); });
  it("rejects a null document", () => { expect(checkRefreshDocument(null)).toBe(false); });
  it("rejects records that are not arrays", () => { expect(checkRefreshDocument({ ...document(), subjects: {} })).toBe(false); });
  it("accepts every defined evidence topic", () => {
    for (const topic of REFRESH_TOPICS) expect(checkRefreshSubject(subject("source-1", { topic }))).toBe(true);
  });
  it("rejects an unsupported topic", () => { expect(checkRefreshSubject({ ...subject(), topic: "medical" })).toBe(false); });
  it("rejects a pack identifier with spaces", () => { expect(checkRefreshSubject({ ...subject(), packId: "pack a" })).toBe(false); });
  it("rejects a missing title", () => { expect(checkRefreshSubject({ ...subject(), title: "" })).toBe(false); });
  it("rejects an excessive title", () => { expect(checkRefreshSubject({ ...subject(), title: "x".repeat(REFRESH_LIMITS.text + 1) })).toBe(false); });
  it("rejects a subject with extra properties", () => { expect(checkRefreshSubject({ ...subject(), trusted: true })).toBe(false); });
  it("rejects subject control characters", () => { expect(checkRefreshSubject({ ...subject(), title: "bad\u0000field" })).toBe(false); });
  it("allows a newline in a user note", () => { expect(checkRefreshObservation(observation("observation-1", { note: "line one\nline two" }))).toBe(true); });
  it("rejects a control character in a user note", () => { expect(checkRefreshObservation({ ...observation(), note: "bad\u0008text" })).toBe(false); });
  it("rejects a DEL character", () => { expect(checkRefreshSource({ ...provenance, reference: "bad\u007fref" })).toBe(false); });
  it("keeps UNKNOWN as an explicit condition", () => { expect(REFRESH_CONDITIONS[0]).toBe("UNKNOWN"); });
  it("keeps UNKNOWN as an explicit tier", () => { expect(REFRESH_TIERS[0]).toBe("UNKNOWN"); });
  it("keeps all manual review decisions", () => { expect(REFRESH_DECISIONS).toEqual(["review-needed", "reviewed", "reopened"]); });
  it("accepts every allowed condition", () => {
    for (const condition of REFRESH_CONDITIONS) expect(checkRefreshObservation(observation("observation-1", { condition }))).toBe(true);
  });
  it("rejects a fabricated readiness condition", () => { expect(checkRefreshObservation({ ...observation(), condition: "ready" })).toBe(false); });
  it("rejects a source without its licence", () => { expect(checkRefreshSource({ ...provenance, licence: "" })).toBe(false); });
  it("rejects a source without a reference", () => { expect(checkRefreshSource({ ...provenance, reference: "" })).toBe(false); });
  it("rejects a source with an unsupported evidence tier", () => { expect(checkRefreshSource({ ...provenance, tier: "guaranteed" })).toBe(false); });
  it("rejects a source with an extra property", () => { expect(checkRefreshSource({ ...provenance, endorsed: true })).toBe(false); });
  it("rejects a missing source object", () => { expect(checkRefreshObservation({ ...observation(), source: null })).toBe(false); });
  it("rejects an observation with extra keys", () => { expect(checkRefreshObservation({ ...observation(), verified: true })).toBe(false); });
  it("rejects a retrieval after the observation", () => {
    expect(checkRefreshObservation({ ...observation(), source: { ...provenance, retrievedOn: "2026-11-21" } })).toBe(false);
  });
  it("rejects a missing observation ID", () => { expect(checkRefreshObservation({ ...observation(), id: "" })).toBe(false); });
  it("accepts an empty manual review note", () => { expect(checkRefreshReview(review("review-1", { note: "" }))).toBe(true); });
  it("rejects a review with an unknown action", () => { expect(checkRefreshReview({ ...review(), decision: "auto-approve" })).toBe(false); });
  it("rejects a review with an unsupported property", () => { expect(checkRefreshReview({ ...review(), packReady: true })).toBe(false); });
  it("rejects an impossible February date", () => { expect(refreshCalendarDay("2026-02-30")).toBe(false); });
  it("accepts a leap-day date", () => { expect(refreshCalendarDay("2024-02-29")).toBe(true); });
  it("rejects a non-leap February 29", () => { expect(refreshCalendarDay("2025-02-29")).toBe(false); });
  it("rejects an invalid month", () => { expect(refreshCalendarDay("2026-13-01")).toBe(false); });
  it("rejects a date with omitted zero-padding", () => { expect(refreshCalendarDay("2026-1-01")).toBe(false); });
  it("rejects local times without explicit UTC", () => { expect(refreshInstant("2026-11-20T10:00:00")).toBe(false); });
  it("rejects timezone-offset timestamps", () => { expect(refreshInstant("2026-11-20T05:00:00-05:00")).toBe(false); });
  it("rejects an impossible UTC hour", () => { expect(refreshInstant("2026-11-20T25:00:00.000Z")).toBe(false); });
  it("accepts a UTC timestamp with milliseconds", () => { expect(refreshInstant(instant)).toBe(true); });
  it("accepts a UTC timestamp without milliseconds", () => { expect(refreshInstant("2026-11-20T10:00:00Z")).toBe(true); });
  it("rejects a timestamp with extra precision", () => { expect(refreshInstant("2026-11-20T10:00:00.1234Z")).toBe(false); });
});

describe("referential integrity and manual review transitions", () => {
  it("rejects duplicate subject IDs", () => { expect(checkRefreshDocument(document([subject(), subject()]))).toBe(false); });
  it("rejects duplicate observation IDs", () => { expect(checkRefreshDocument(document([subject()], [observation(), observation()]))).toBe(false); });
  it("rejects duplicate review IDs", () => { expect(checkRefreshDocument(document([subject()], [observation()], [review(), review()]))).toBe(false); });
  it("rejects observations for absent subjects", () => { expect(checkRefreshDocument(document([subject()], [observation("observation-1", { subjectId: "missing" })]))).toBe(false); });
  it("rejects reviews for absent subjects", () => { expect(checkRefreshDocument(document([subject()], [observation()], [review("review-1", { subjectId: "missing" })]))).toBe(false); });
  it("rejects observations before their subject was created", () => {
    expect(checkRefreshDocument(document([subject()], [observation("observation-1", { observedAt: "2026-11-20T09:00:00.000Z" })]))).toBe(false);
  });
  it("rejects a review without an earlier observation", () => { expect(checkRefreshDocument(document([subject()], [], [review()]))).toBe(false); });
  it("rejects a review before its observation", () => {
    expect(checkRefreshDocument(document([subject()], [observation()], [review("review-1", { at: instant })]))).toBe(false);
  });
  it("rejects reviewed status without a preceding review request", () => {
    expect(checkRefreshDocument(document([subject()], [observation()], [review("review-1", { decision: "reviewed" })]))).toBe(false);
  });
  it("rejects reopening without completed review", () => {
    expect(checkRefreshDocument(document([subject()], [observation()], [review("review-1", { decision: "reopened" })]))).toBe(false);
  });
  it("accepts a review request", () => { expect(checkRefreshDocument(document([subject()], [observation()], [review()]))).toBe(true); });
  it("accepts reviewed after review requested", () => {
    expect(checkRefreshDocument(document([subject()], [observation()], [review(), review("review-2", { at: "2026-11-20T13:00:00.000Z", decision: "reviewed" })]))).toBe(true);
  });
  it("accepts reopening after completed review", () => {
    expect(checkRefreshDocument(document([subject()], [observation()], [review(), review("review-2", { at: "2026-11-20T13:00:00.000Z", decision: "reviewed" }), review("review-3", { at: "2026-11-20T14:00:00.000Z", decision: "reopened" })]))).toBe(true);
  });
  it("rejects two back-to-back review requests", () => {
    expect(checkRefreshDocument(document([subject()], [observation()], [review(), review("review-2", { at: "2026-11-20T13:00:00.000Z" })]))).toBe(false);
  });
  it("accepts creating a new subject", () => {
    const result = appendRefreshSubject(emptyRefreshDocument(), subject());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.subjects).toHaveLength(1);
  });
  it("does not mutate the original document on create", () => {
    const doc = emptyRefreshDocument();
    appendRefreshSubject(doc, subject());
    expect(doc.subjects).toHaveLength(0);
  });
  it("rejects adding a duplicate subject", () => { expect(appendRefreshSubject(document(), subject())).toMatchObject({ ok: false, issue: "duplicate" }); });
  it("rejects unsupported source topics", () => { expect(appendRefreshSubject(document(), { ...subject("source-2"), topic: "auto" as RefreshSubject["topic"] }).ok).toBe(false); });
  it("adds a user observation", () => {
    const result = appendRefreshObservation(document([subject()], []), observation());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.observations).toHaveLength(1);
  });
  it("rejects observation without its subject", () => {
    expect(appendRefreshObservation(document(), observation("observation-2", { subjectId: "missing" }))).toMatchObject({ ok: false, issue: "reference" });
  });
  it("rejects an observation inserted earlier than the prior observation", () => {
    const older = observation("observation-2", { observedAt: "2026-11-20T10:30:00.000Z" });
    expect(appendRefreshObservation(document(), older).ok).toBe(false);
  });
  it("rejects duplicate observation identifier", () => { expect(appendRefreshObservation(document(), observation())).toMatchObject({ ok: false, issue: "duplicate" }); });
  it("does not change the existing observation list on failed insertion", () => {
    const doc = document();
    appendRefreshObservation(doc, observation());
    expect(doc.observations).toHaveLength(1);
  });
  it("creates a manual review request", () => { expect(appendRefreshReview(document(), review()).ok).toBe(true); });
  it("rejects completed review without a request", () => {
    expect(appendRefreshReview(document(), review("review-1", { decision: "reviewed" }))).toMatchObject({ ok: false, issue: "transition" });
  });
  it("rejects review without a recorded observation", () => { expect(appendRefreshReview(document([subject()], []), review()).ok).toBe(false); });
  it("rejects review before an observation timestamp", () => { expect(appendRefreshReview(document(), review("review-1", { at: instant })).ok).toBe(false); });
  it("rejects a review for another subject", () => { expect(appendRefreshReview(document(), review("review-1", { subjectId: "missing" })).ok).toBe(false); });
  it("rejects duplicate review IDs", () => { expect(appendRefreshReview(document([subject()], [observation()], [review()]), review()).ok).toBe(false); });
  it("accepts a manual reviewed transition", () => {
    const r = appendRefreshReview(document([subject()], [observation()], [review()]), review("review-2", { at: "2026-11-20T13:00:00.000Z", decision: "reviewed" }));
    expect(r.ok).toBe(true);
  });
  it("accepts reopening a completed manual review", () => {
    const doc = document([subject()], [observation()], [review(), review("review-2", { at: "2026-11-20T13:00:00.000Z", decision: "reviewed" })]);
    expect(appendRefreshReview(doc, review("review-3", { at: "2026-11-20T14:00:00.000Z", decision: "reopened" })).ok).toBe(true);
  });
  it("rejects a second request while still open", () => { expect(appendRefreshReview(document([subject()], [observation()], [review()]), review("review-2", { at: "2026-11-20T13:00:00.000Z" })).ok).toBe(false); });
  it("rejects a repeated review request after reopening a completed review", () => {
    const history = document([subject()], [observation()], [review(),
      review("review-2", { at: "2026-11-20T13:00:00.000Z", decision: "reviewed" }),
      review("review-3", { at: "2026-11-20T14:00:00.000Z", decision: "reopened" })]);
    const result = appendRefreshReview(history, review("review-4", { at: "2026-11-20T15:00:00.000Z" }));
    expect(result).toMatchObject({ ok: false, issue: "transition" });
  });
  it("keeps the latest observation", () => {
    const doc = document([subject()], [observation(), observation("observation-2", { observedAt: latest, condition: "unavailable" })]);
    expect(latestRefreshObservation(doc, "source-1")?.condition).toBe("unavailable");
  });
  it("returns null for missing observation", () => { expect(latestRefreshObservation(emptyRefreshDocument(), "missing")).toBeNull(); });
  it("returns null for missing review", () => { expect(latestRefreshReview(document(), "source-1")).toBeNull(); });
  it("sorts observed activity by timestamp", () => {
    const doc = document([subject()], [observation("observation-2", { observedAt: latest }), observation()]);
    expect(refreshObservationsFor(doc, "source-1").map((x) => x.id)).toEqual(["observation-1", "observation-2"]);
  });
  it("sorts review activity by timestamp", () => {
    const doc = document([subject()], [observation()], [review("review-2", { at: "2026-11-20T13:00:00.000Z", decision: "reviewed" }), review()]);
    expect(refreshReviewsFor(doc, "source-1").map((x) => x.id)).toEqual(["review-1", "review-2"]);
  });
});

describe("bounded local files, merges, filtering and summaries", () => {
  it("round-trips a valid local document", () => {
    const serialized = exportRefreshDocument(document());
    expect(serialized.ok).toBe(true);
    if (serialized.ok) expect(parseRefreshDocument(serialized.value)).toEqual({ ok: true, value: document() });
  });
  it("rejects invalid JSON", () => { expect(parseRefreshDocument("{")).toMatchObject({ ok: false, issue: "format" }); });
  it("rejects unexpected document keys", () => { expect(parseRefreshDocument(JSON.stringify({ ...document(), personalData: true })).ok).toBe(false); });
  it("rejects unknown IDs in imported reviews", () => { expect(parseRefreshDocument(JSON.stringify(document([subject()], [observation()], [review("review-1", { subjectId: "other" })]))).ok).toBe(false); });
  it("rejects input beyond the byte limit", () => { expect(parseRefreshDocument("x".repeat(REFRESH_LIMITS.bytes + 1))).toMatchObject({ ok: false, issue: "limit" }); });
  it("refuses a valid document whose JSON exceeds the export budget", () => {
    const large = document([subject()], Array.from({ length: 750 }, (_, i) => observation(`observation-${i}`, { note: "x".repeat(800) })));
    expect(exportRefreshDocument(large)).toMatchObject({ ok: false, issue: "limit" });
  });
  it("never accepts an invented pack usable flag", () => { expect(parseRefreshDocument(JSON.stringify({ ...document(), packUsable: true })).ok).toBe(false); });
  it("previews an additive import", () => {
    const a = document();
    const b = document([subject(), subject("source-2")]);
    expect(previewRefreshMerge(a, b)).toMatchObject({ addedSubjects: 1, sharedSubjects: 1, canMerge: true });
  });
  it("does not silently overwrite a shared subject", () => {
    const result = previewRefreshMerge(document(), document([subject("source-1", { title: "Different claim" })]));
    expect(result.canMerge).toBe(false);
    expect(result.conflicts).toBeGreaterThan(0);
  });
  it("does not silently overwrite a shared observation", () => {
    const result = previewRefreshMerge(document(), document([subject()], [observation("observation-1", { note: "Changed" })]));
    expect(result.canMerge).toBe(false);
  });
  it("does not silently overwrite a shared review event", () => {
    const a = document([subject()], [observation()], [review()]);
    const b = document([subject()], [observation()], [review("review-1", { note: "Different" })]);
    expect(previewRefreshMerge(a, b).canMerge).toBe(false);
  });
  it("rejects an imported orphan observation in merge", () => {
    const b = document([subject("source-2", { packId: "pack-b" })], [observation("observation-2", { subjectId: "source-2" })]);
    expect(mergeRefreshDocuments(document(), b).ok).toBe(true);
  });
  it("merges nonconflicting subjects", () => {
    const a = document();
    const b = document([subject("source-2", { packId: "pack-b" })], [observation("observation-2", { subjectId: "source-2" })]);
    const result = mergeRefreshDocuments(a, b);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.subjects).toHaveLength(2);
  });
  it("rejects a conflicting merge", () => {
    expect(mergeRefreshDocuments(document(), document([subject("source-1", { title: "Different" })])).ok).toBe(false);
  });
  it("does not mutate the first document during merge", () => {
    const a = document();
    mergeRefreshDocuments(a, document([subject("source-2")]));
    expect(a.subjects).toHaveLength(1);
  });
  it("returns the next unused subject ID", () => { expect(nextRefreshId(document(), "subject")).toBe("source-2"); });
  it("returns the next unused observation ID", () => { expect(nextRefreshId(document(), "observation")).toBe("observation-2"); });
  it("returns the next unused review ID", () => { expect(nextRefreshId(document(), "review")).toBe("review-1"); });
  it("filters subjects by pack", () => {
    const doc = document([subject(), subject("source-2", { packId: "pack-b" })]);
    expect(filterRefreshSubjects(doc, { packId: "pack-b" }).map((x) => x.id)).toEqual(["source-2"]);
  });
  it("filters subjects by topic", () => {
    const doc = document([subject(), subject("source-2", { topic: "integrity" })]);
    expect(filterRefreshSubjects(doc, { topic: "integrity" }).map((x) => x.id)).toEqual(["source-2"]);
  });
  it("filters subjects by title text", () => {
    expect(filterRefreshSubjects(document(), { contains: "LOCAL PACK" })).toHaveLength(1);
  });
  it("filters subjects by latest condition", () => {
    expect(filterRefreshSubjects(document(), { condition: "UNKNOWN" })).toHaveLength(1);
  });
  it("does not equate UNKNOWN with available", () => {
    expect(filterRefreshSubjects(document(), { condition: "available" })).toHaveLength(0);
  });
  it("counts unique pack identifiers", () => {
    const doc = document([subject(), subject("source-2", { packId: "pack-b" })]);
    expect(summarizeRefresh(doc).packs).toBe(2);
  });
  it("counts subjects without observed condition as UNKNOWN", () => {
    expect(summarizeRefresh(document([subject()], [])).unknown).toBe(1);
  });
  it("counts unreviewed sources separately", () => { expect(summarizeRefresh(document()).unresolved).toBe(1); });
  it("never equates human review to pack readiness", () => { expect(refreshContentReady()).toBe(false); });
});

describe("completed reviews and later evidence", () => {
  const complete = document([subject()], [observation()], [
    review(), review("review-2", { at: "2026-11-20T13:00:00.000Z", decision: "reviewed" }),
  ]);
  const newer = observation("observation-2", { observedAt: "2026-11-20T14:00:00.000Z", condition: "unavailable" });
  const changed = document(complete.subjects, [...complete.observations, newer], complete.reviews);
  it("recognizes a completed review with no later observations", () => { expect(refreshReviewCurrent(complete, "source-1")).toBe(true); });
  it("does not treat a missing subject as reviewed", () => { expect(refreshReviewCurrent(complete, "missing")).toBe(false); });
  it("requires a new manual review after a newer observation", () => { expect(refreshReviewCurrent(changed, "source-1")).toBe(false); });
  it("does not silently erase a previously completed review event", () => { expect(changed.reviews).toHaveLength(2); });
  it("keeps the new observation independently recorded", () => { expect(latestRefreshObservation(changed, "source-1")?.condition).toBe("unavailable"); });
  it("counts a newly changed item as unresolved", () => { expect(summarizeRefresh(changed).unresolved).toBe(1); });
  it("does not count an unchanged reviewed item as unresolved", () => { expect(summarizeRefresh(complete).unresolved).toBe(0); });
  it("filters newly changed evidence for manual review", () => { expect(filterRefreshSubjects(changed, { needsReview: true })).toHaveLength(1); });
  it("does not return an unchanged reviewed item in the review filter", () => { expect(filterRefreshSubjects(complete, { needsReview: true })).toHaveLength(0); });
  it("does not infer content readiness from a completed review", () => { expect(refreshContentReady()).toBe(false); });
});
