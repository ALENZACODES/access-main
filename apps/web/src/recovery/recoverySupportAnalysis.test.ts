import { describe, expect, it } from "vitest";
import {
  briefCoverage, briefFindings, briefNarrative, briefObservationsFor,
  briefQuestionsFor, briefReport, briefReviewQueue, briefSourceAge,
  compareBriefs, groupBriefs,
} from "./recoverySupportAnalysis";
import {
  addBriefObservation, addBriefQuestion, beginBrief, changeBriefState,
  emptyBriefDocument, type BriefCase, type BriefDocument, type BriefObservation,
  type BriefQuestion,
} from "./recoverySupportBrief";
const date = "2026-11-19T09:00:00.000Z";
const later = "2026-11-19T10:00:00.000Z";
const source = { name: "Offline example", licence: "Example licence", reference: "local-record", retrievedOn: "2026-11-19", tier: "UNKNOWN" as const };
const sampleCase = (id = "case-1", overrides: Partial<BriefCase> = {}): BriefCase => ({ id, packId: "pack-a", title: "Download interrupted", condition: "UNKNOWN", operation: "download", openedAt: date, source, state: "draft", ...overrides });
const sampleObs = (id = "obs-1", overrides: Partial<BriefObservation> = {}): BriefObservation => ({ id, briefId: "case-1", capturedAt: later, condition: "UNKNOWN", summary: "Stopped locally", source, ...overrides });
const sampleQuestion = (id = "question-1", overrides: Partial<BriefQuestion> = {}): BriefQuestion => ({ id, briefId: "case-1", capturedAt: later, topic: "handoff", state: "UNKNOWN", question: "Which source is missing?", response: "", source, ...overrides });
const unwrap = <T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: string }): T => {
  if (!result.ok) throw Error(result.issue);
  return result.value;
};
const base = (): BriefDocument => unwrap(beginBrief(emptyBriefDocument(), sampleCase()));
const withObservation = (): BriefDocument => unwrap(addBriefObservation(base(), sampleObs()));
const withQuestion = (): BriefDocument => unwrap(addBriefQuestion(base(), sampleQuestion()));
const sample = (): BriefDocument => unwrap(addBriefQuestion(withObservation(), sampleQuestion()));

describe("support brief findings", () => {
  it("reports nothing for empty documents", () => { expect(briefFindings(emptyBriefDocument(), "2026-11-19")).toEqual([]); });
  it("flags the UNKNOWN case condition", () => { expect(briefFindings(base(), "2026-11-19").map((f) => f.code)).toContain("unknown-condition"); });
  it("flags absent observations without inventing them", () => { expect(briefFindings(base(), "2026-11-19").map((f) => f.code)).toContain("missing-observation"); });
  it("stops reporting absent observations when one exists", () => { expect(briefFindings(withObservation(), "2026-11-19").map((f) => f.code)).not.toContain("missing-observation"); });
  it("reports an unanswered UNKNOWN question", () => { expect(briefFindings(withQuestion(), "2026-11-19").map((f) => f.code)).toContain("unanswered-question"); });
  it("does not call an explicit answer unanswered", () => { const x = unwrap(addBriefQuestion(base(), sampleQuestion("q-2", { state: "answered", response: "No document available" }))); expect(briefFindings(x, "2026-11-19").map((f) => f.code)).not.toContain("unanswered-question"); });
  it("keeps archived documents out of unfinished-review findings", () => { const x = unwrap(changeBriefState(unwrap(changeBriefState(base(), "case-1", "review-requested", later)), "case-1", "archived", "2026-11-19T11:00:00.000Z")); expect(briefFindings(x, "2026-11-19").map((f) => f.code)).not.toContain("unfinished-review"); });
  it("still does not infer pack readiness from archived notes", () => { const x = unwrap(changeBriefState(unwrap(changeBriefState(base(), "case-1", "review-requested", later)), "case-1", "archived", "2026-11-19T11:00:00.000Z")); expect(briefReport(x, "2026-11-19").contentReady).toBe(false); });
  it("reports a stale case source", () => { expect(briefFindings(base(), "2027-03-01").map((f) => f.code)).toContain("stale-source"); });
  it("does not call a new source stale", () => { expect(briefFindings(base(), "2026-11-19").map((f) => f.code)).not.toContain("stale-source"); });
  it("reports a deferred question for manual review", () => { const x = unwrap(addBriefQuestion(base(), sampleQuestion("q-3", { state: "deferred" }))); expect(briefFindings(x, "2026-11-19").map((f) => f.code)).toContain("disputed-answer"); });
  it("detects conflicting observations on the same day", () => { const x = unwrap(addBriefObservation(withObservation(), sampleObs("obs-2", { condition: "interrupted" }))); expect(briefFindings(x, "2026-11-19").map((f) => f.code)).toContain("conflicting-observation"); });
  it("does not merge contradictory conditions into a ready claim", () => { const x = unwrap(addBriefObservation(withObservation(), sampleObs("obs-2", { condition: "interrupted" }))); expect(briefReport(x, "2026-11-19").contentReady).toBe(false); });
  it("does not confuse observations on different days", () => { const x = unwrap(addBriefObservation(withObservation(), sampleObs("obs-2", { capturedAt: "2026-11-20T10:00:00.000Z", condition: "interrupted" }))); expect(briefFindings(x, "2026-11-20").map((f) => f.code)).not.toContain("conflicting-observation"); });
  it("ranks conflicting observations above missing evidence", () => { const x = unwrap(addBriefObservation(withObservation(), sampleObs("obs-2", { condition: "interrupted" }))); expect(briefFindings(x, "2026-11-19")[0]?.level).toBe("high"); });
  it("retains the exact related brief identifier", () => { expect(briefFindings(base(), "2026-11-19").every((f) => f.briefId === "case-1")).toBe(true); });
  it("keeps findings attached to supplied data only", () => { expect(briefFindings(emptyBriefDocument(), "2026-11-19")).toHaveLength(0); });
});

describe("source age and chronology", () => {
  it("returns zero days on the retrieval day", () => { expect(briefSourceAge(source, "2026-11-19")).toBe(0); });
  it("counts one whole day", () => { expect(briefSourceAge(source, "2026-11-20")).toBe(1); });
  it("counts seven days", () => { expect(briefSourceAge(source, "2026-11-26")).toBe(7); });
  it("does not assign a negative age", () => { expect(briefSourceAge(source, "2026-11-18")).toBeNull(); });
  it("does not assign age when asOf is malformed", () => { expect(briefSourceAge(source, "today")).toBeNull(); });
  it("uses calendar dates, not arbitrary local timezone", () => { expect(briefSourceAge(source, "2026-11-19")).toBe(0); });
  it("does not infer current date from the clock", () => { expect(briefSourceAge(source, "UNKNOWN")).toBeNull(); });
  it("ignores unrelated pack observations", () => { expect(briefObservationsFor(base(), "missing")).toEqual([]); });
  it("returns one recorded observation", () => { expect(briefObservationsFor(withObservation(), "case-1")).toHaveLength(1); });
  it("returns one recorded question", () => { expect(briefQuestionsFor(withQuestion(), "case-1")).toHaveLength(1); });
  it("preserves the recorded observation source", () => { expect(briefObservationsFor(withObservation(), "case-1")[0]?.source).toEqual(source); });
  it("preserves the recorded question source", () => { expect(briefQuestionsFor(withQuestion(), "case-1")[0]?.source).toEqual(source); });
});

describe("grouping, review priorities and report", () => {
  it("groups nothing when the document is empty", () => { expect(groupBriefs(emptyBriefDocument(), "2026-11-19")).toEqual([]); });
  it("creates a group for the recorded pack", () => { expect(groupBriefs(base(), "2026-11-19")[0]?.packId).toBe("pack-a"); });
  it("does not duplicate the pack group for two observations", () => { expect(groupBriefs(withObservation(), "2026-11-19")).toHaveLength(1); });
  it("preserves UNKNOWN in group conditions", () => { expect(groupBriefs(base(), "2026-11-19")[0]?.conditions).toEqual(["UNKNOWN"]); });
  it("counts questions that remain open", () => { expect(groupBriefs(withQuestion(), "2026-11-19")[0]?.unanswered).toBe(1); });
  it("does not infer group content readiness", () => { expect(groupBriefs(base(), "2026-11-19")[0]?.contentReady).toBe(false); });
  it("generates manual review suggestions", () => { expect(briefReviewQueue(base(), "2026-11-19")).toHaveLength(1); });
  it("includes the original brief title", () => { expect(briefReviewQueue(base(), "2026-11-19")[0]?.title).toBe("Download interrupted"); });
  it("prioritizes contradiction", () => { const x = unwrap(addBriefObservation(withObservation(), sampleObs("obs-2", { condition: "missing" }))); expect(briefReviewQueue(x, "2026-11-19")[0]?.priority).toBe("high"); });
  it("keeps all review requests fail-closed", () => { expect(briefReviewQueue(base(), "2026-11-19")[0]?.contentReady).toBe(false); });
  it("keeps the supplied asOf date", () => { expect(briefReport(base(), "2026-11-19").asOf).toBe("2026-11-19"); });
  it("reports actual brief count", () => { expect(briefReport(base(), "2026-11-19").briefs).toBe(1); });
  it("reports actual question count", () => { expect(briefReport(sample(), "2026-11-19").questions).toBe(1); });
  it("reports unresolved UNKNOWN counts", () => { expect(briefReport(sample(), "2026-11-19").unknown).toBe(3); });
  it("never promotes a review note to ready", () => { expect(briefReport(sample(), "2026-11-19").contentReady).toBe(false); });
});

describe("question topic coverage", () => {
  it("includes every supported topic in an empty document", () => { expect(Object.keys(briefCoverage(emptyBriefDocument(), "case-1"))).toHaveLength(5); });
  it("counts one handoff question", () => { expect(briefCoverage(withQuestion(), "case-1").handoff).toBe(1); });
  it("does not invent a source question", () => { expect(briefCoverage(withQuestion(), "case-1").source).toBe(0); });
  it("does not count another case", () => { expect(briefCoverage(withQuestion(), "other").handoff).toBe(0); });
  it("is deterministic for repeated calls", () => { expect(briefCoverage(withQuestion(), "case-1")).toEqual(briefCoverage(withQuestion(), "case-1")); });
});

describe("manual comparisons", () => {
  it("compares two empty documents", () => { expect(compareBriefs(emptyBriefDocument(), emptyBriefDocument(), "case-1").newObservations).toEqual([]); });
  it("finds newly added observation IDs", () => { expect(compareBriefs(base(), withObservation(), "case-1").newObservations).toEqual(["obs-1"]); });
  it("finds removed observation IDs", () => { expect(compareBriefs(withObservation(), base(), "case-1").missingObservations).toEqual(["obs-1"]); });
  it("finds newly added questions", () => { expect(compareBriefs(base(), withQuestion(), "case-1").newQuestions).toEqual(["question-1"]); });
  it("does not call stable observations changed", () => { expect(compareBriefs(withObservation(), withObservation(), "case-1").changedObservations).toEqual([]); });
  it("does not call stable questions changed", () => { expect(compareBriefs(withQuestion(), withQuestion(), "case-1").changedQuestions).toEqual([]); });
  it("never treats comparison as pack readiness", () => { expect(compareBriefs(base(), withObservation(), "case-1").contentReady).toBe(false); });
  it("retains the requested case ID", () => { expect(compareBriefs(base(), withObservation(), "case-1").briefId).toBe("case-1"); });
});

describe("English and French text handoff", () => {
  it("includes the supplied date in English", () => { expect(briefNarrative(sample(), "2026-11-19", "en")).toContain("2026-11-19"); });
  it("includes the supplied date in French", () => { expect(briefNarrative(sample(), "2026-11-19", "fr")).toContain("2026-11-19"); });
  it("preserves the literal UNKNOWN in English", () => { expect(briefNarrative(sample(), "2026-11-19", "en")).toContain("UNKNOWN"); });
  it("preserves the literal UNKNOWN in French", () => { expect(briefNarrative(sample(), "2026-11-19", "fr")).toContain("UNKNOWN"); });
  it("includes the user's question rather than inventing an answer", () => { expect(briefNarrative(sample(), "2026-11-19", "en")).toContain("Which source is missing?"); });
  it("includes a plain disclaimer in English", () => { expect(briefNarrative(base(), "2026-11-19", "en")).toContain("do not establish"); });
  it("includes a plain disclaimer in French", () => { expect(briefNarrative(base(), "2026-11-19", "fr")).toContain("ne confirment pas"); });
  it("uses a nonbreaking space before French colon labels", () => { expect(briefNarrative(base(), "2026-11-19", "fr")).toContain("\u00a0:"); });
  it("does not insert contact details", () => { expect(briefNarrative(base(), "2026-11-19", "en")).not.toMatch(/@example|\+1-\d{3}/u); });
  it("does not export private access tokens", () => { expect(briefNarrative(base(), "2026-11-19", "en")).not.toContain("apiKey"); });
});
