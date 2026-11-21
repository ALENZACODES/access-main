import { describe, expect, it } from "vitest";
import { addBriefObservation, addBriefQuestion, beginBrief, changeBriefState, emptyBriefDocument, mergeBriefs, previewBriefMerge, type BriefCase, type BriefDocument } from "./recoverySupportBrief";
const source = { name: "Local record", licence: "Example licence", reference: "a-1", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const };
const now = "2026-11-19T10:00:00.000Z";
const later = "2026-11-19T11:00:00.000Z";
const sample = (id: string, packId = "pack-a"): BriefCase => ({ id, packId, title: "Local operation stopped", operation: "pack", condition: "UNKNOWN", state: "draft", openedAt: now, source });
const opened = (id = "case-1", packId = "pack-a"): BriefDocument => {
  const result = beginBrief(emptyBriefDocument(), sample(id, packId));
  if (!result.ok) throw Error(result.issue);
  return result.value;
};
const unwrap = <T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: string }): T => {
  if (!result.ok) throw Error(result.issue);
  return result.value;
};
describe("offline support brief import previews", () => {
  it("previews merging two empty documents", () => { expect(previewBriefMerge(emptyBriefDocument(), emptyBriefDocument()).canMerge).toBe(true); });
  it("does not add a duplicate identical case", () => { expect(previewBriefMerge(opened(), opened()).addedBriefs).toBe(0); });
  it("does not conflict when case and event objects are equal", () => { expect(previewBriefMerge(opened(), opened()).conflicts).toEqual([]); });
  it("reports one incoming case", () => { expect(previewBriefMerge(emptyBriefDocument(), opened()).incoming).toBe(1); });
  it("reports one new case", () => { expect(previewBriefMerge(emptyBriefDocument(), opened()).addedBriefs).toBe(1); });
  it("reports a new creation event", () => { expect(previewBriefMerge(emptyBriefDocument(), opened()).addedEvents).toBe(1); });
  it("returns a deterministic preview", () => { expect(previewBriefMerge(opened(), opened())).toEqual(previewBriefMerge(opened(), opened())); });
  it("rejects conflicting titles for the same case", () => { const b = opened(); const conflicting = { ...b, briefs: [{ ...b.briefs[0]!, title: "Different" }] }; expect(previewBriefMerge(b, conflicting).canMerge).toBe(false); });
  it("exposes a case collision ID", () => { const b = opened(); const conflicting = { ...b, briefs: [{ ...b.briefs[0]!, title: "Different" }] }; expect(previewBriefMerge(b, conflicting).conflicts).toContain("brief:case-1"); });
  it("does not silently choose either conflict winner", () => { const b = opened(); const conflicting = { ...b, briefs: [{ ...b.briefs[0]!, title: "Different" }] }; expect(mergeBriefs(b, conflicting).ok).toBe(false); });
  it("adds independent case and event IDs", () => { const a = opened("case-1"); const b = opened("case-2"); expect(previewBriefMerge(a, b).addedBriefs).toBe(1); });
  it("detects a common event ID conflict in independent cases", () => { const a = opened("case-1"); const b = opened("case-2"); expect(previewBriefMerge(a, b).conflicts).toContain("event:event-1"); });
  it("does not mask event ID conflicts", () => { const a = opened("case-1"); const b = opened("case-2"); expect(mergeBriefs(a, b).ok).toBe(false); });
  it("keeps equal empty imports a no-op", () => { expect(mergeBriefs(emptyBriefDocument(), emptyBriefDocument()).ok).toBe(true); });
  it("preserves all case sources on a no-op merge", () => { expect(unwrap(mergeBriefs(opened(), opened())).briefs[0]?.source).toEqual(source); });
  it("preserves an UNKNOWN case condition", () => { expect(unwrap(mergeBriefs(opened(), opened())).briefs[0]?.condition).toBe("UNKNOWN"); });
  it("does not infer an installed pack ready state", () => { expect(unwrap(mergeBriefs(opened(), opened())).briefs[0]?.state).toBe("draft"); });
  it("remains unchanged after an import collision", () => { const a = opened(); const before = JSON.stringify(a); mergeBriefs(a, { ...a, briefs: [{ ...a.briefs[0]!, title: "Different" }] }); expect(JSON.stringify(a)).toBe(before); });
  it("rejects a forged archived state on import preview", () => { const a = opened(); const b = { ...a, briefs: [{ ...a.briefs[0]!, state: "archived" as const }] }; expect(previewBriefMerge(a, b).canMerge).toBe(false); });
  it("rejects a forged orphan question", () => { const a = opened(); const b = { ...a, questions: [{ id: "q-1", briefId: "unknown", topic: "handoff" as const, state: "UNKNOWN" as const, question: "Check?", response: "", capturedAt: later, source }] }; expect(previewBriefMerge(a, b).canMerge).toBe(false); });
});

describe("conflict safety for observations and questions", () => {
  const withObservation = (): BriefDocument => unwrap(addBriefObservation(opened(), { id: "obs-1", briefId: "case-1", capturedAt: later, condition: "UNKNOWN", summary: "Stopped", source }));
  const withQuestion = (): BriefDocument => unwrap(addBriefQuestion(opened(), { id: "question-1", briefId: "case-1", capturedAt: later, topic: "handoff", state: "UNKNOWN", question: "Where next?", response: "", source }));
  it("reports new observations", () => { expect(previewBriefMerge(opened(), withObservation()).addedObservations).toBe(1); });
  it("reports new questions", () => { expect(previewBriefMerge(opened(), withQuestion()).addedQuestions).toBe(1); });
  it("does not duplicate existing observations", () => { expect(previewBriefMerge(withObservation(), withObservation()).addedObservations).toBe(0); });
  it("does not duplicate existing questions", () => { expect(previewBriefMerge(withQuestion(), withQuestion()).addedQuestions).toBe(0); });
  it("detects incompatible observation summaries", () => { const a = withObservation(); const b = { ...a, observations: [{ ...a.observations[0]!, summary: "Changed" }] }; expect(previewBriefMerge(a, b).conflicts).toContain("observation:obs-1"); });
  it("detects incompatible question text", () => { const a = withQuestion(); const b = { ...a, questions: [{ ...a.questions[0]!, question: "Different?" }] }; expect(previewBriefMerge(a, b).conflicts).toContain("question:question-1"); });
  it("does not replace any source reference during merge", () => { const a = withObservation(); const merged = unwrap(mergeBriefs(a, a)); expect(merged.observations[0]?.source.reference).toBe(source.reference); });
  it("does not infer answers after merge", () => { const a = withQuestion(); expect(unwrap(mergeBriefs(a, a)).questions[0]?.state).toBe("UNKNOWN"); });
  it("rejects incompatible review transitions", () => { const a = opened(); const b = unwrap(changeBriefState(a, "case-1", "review-requested", later)); expect(previewBriefMerge(a, b).canMerge).toBe(false); });
  it("does not rewrite a review stage as draft", () => { const a = opened(); const b = unwrap(changeBriefState(a, "case-1", "review-requested", later)); expect(mergeBriefs(a, b).ok).toBe(false); });
  it("preserves the source record in a successful self-merge", () => { const a = withQuestion(); expect(unwrap(mergeBriefs(a, a)).questions[0]?.source).toEqual(source); });
  it("cannot merge a foreign schema", () => { const a = opened(); expect(previewBriefMerge(a, { ...a, schema: "other" as never }).canMerge).toBe(false); });
});
