import { describe, expect, it } from "vitest";
import { briefReviewText, briefTopicLabels, buildBriefPortfolio, buildBriefReviewPlan } from "./recoverySupportReview";
import { addBriefObservation, addBriefQuestion, beginBrief, emptyBriefDocument, type BriefDocument } from "./recoverySupportBrief";
const now = "2026-11-19T10:00:00.000Z";
const source = { name: "Example source", licence: "Example licence", retrievedOn: "2026-11-19", reference: "local-record", tier: "UNKNOWN" as const };
function base(): BriefDocument {
  const result = beginBrief(emptyBriefDocument(), { id: "brief-1", packId: "pack-a", title: "Missing parts", operation: "pack", condition: "UNKNOWN", openedAt: now, state: "draft", source });
  if (!result.ok) throw Error(result.issue);
  return result.value;
}
function withQuestion(): BriefDocument {
  const result = addBriefQuestion(base(), { id: "q-1", briefId: "brief-1", topic: "handoff", state: "UNKNOWN", question: "Who can review it?", response: "", capturedAt: now, source });
  if (!result.ok) throw Error(result.issue);
  return result.value;
}
function withObservation(): BriefDocument {
  const result = addBriefObservation(base(), { id: "o-1", briefId: "brief-1", condition: "UNKNOWN", capturedAt: now, summary: "No parts available", source });
  if (!result.ok) throw Error(result.issue);
  return result.value;
}
describe("manual coverage review plan", () => {
  it("returns null for an absent brief", () => { expect(buildBriefReviewPlan(base(), "missing", "2026-11-19")).toBeNull(); });
  it("reports a known pack id", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.packId).toBe("pack-a"); });
  it("lists all five user question categories", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.topics).toHaveLength(5); });
  it("uses UNKNOWN for an unrecorded category", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.topics[0]?.status).toBe("UNKNOWN"); });
  it("does not invent answered questions", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.topics[0]?.answered).toBe(0); });
  it("counts one recorded handoff question", () => { expect(buildBriefReviewPlan(withQuestion(), "brief-1", "2026-11-19")?.topics.find((item) => item.topic === "handoff")?.recorded).toBe(1); });
  it("keeps an UNKNOWN question unanswered", () => { expect(buildBriefReviewPlan(withQuestion(), "brief-1", "2026-11-19")?.topics.find((item) => item.topic === "handoff")?.open).toBe(1); });
  it("marks a recorded unanswered topic unresolved", () => { expect(buildBriefReviewPlan(withQuestion(), "brief-1", "2026-11-19")?.topics.find((item) => item.topic === "handoff")?.status).toBe("unanswered"); });
  it("never upgrades an unanswered question", () => { expect(buildBriefReviewPlan(withQuestion(), "brief-1", "2026-11-19")?.contentReady).toBe(false); });
  it("does not erase a missing observation finding", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.nextSteps.join(" ")).toContain("Record what happened"); });
  it("does not ask to record an observation already present", () => { expect(buildBriefReviewPlan(withObservation(), "brief-1", "2026-11-19")?.nextSteps.join(" ")).not.toContain("Record what happened"); });
  it("explains that the condition remains UNKNOWN", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.nextSteps.join(" ")).toContain("UNKNOWN"); });
  it("never proposes a scheduled automatic retry", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.nextSteps.join(" ")).not.toMatch(/scheduled|automatic retry/iu); });
  it("includes an explicit manual review step", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.nextSteps.join(" ")).toContain("manual review"); });
  it("orders topics consistently", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.topics.map((item) => item.topic)).toEqual(["what-happened", "missing-evidence", "source", "next-step", "handoff"]); });
  it("does not convert empty coverage into successful completion", () => { expect(buildBriefReviewPlan(base(), "brief-1", "2026-11-19")?.outstanding).toHaveLength(5); });
});

describe("portfolio view across local briefs", () => {
  it("has no rows for an empty document", () => { expect(buildBriefPortfolio(emptyBriefDocument(), "2026-11-19").ordered).toEqual([]); });
  it("counts one case", () => { expect(buildBriefPortfolio(base(), "2026-11-19").total).toBe(1); });
  it("counts one UNKNOWN condition", () => { expect(buildBriefPortfolio(base(), "2026-11-19").withUnknownConditions).toBe(1); });
  it("counts an open question without implying an answer", () => { expect(buildBriefPortfolio(withQuestion(), "2026-11-19").withUnansweredQuestions).toBe(1); });
  it("does not count a question that is absent", () => { expect(buildBriefPortfolio(base(), "2026-11-19").withUnansweredQuestions).toBe(0); });
  it("does not infer conflicts from one observation", () => { expect(buildBriefPortfolio(withObservation(), "2026-11-19").withConflicts).toBe(0); });
  it("does not infer content readiness", () => { expect(buildBriefPortfolio(base(), "2026-11-19").contentReady).toBe(false); });
  it("makes repeat calls deterministic", () => { expect(buildBriefPortfolio(base(), "2026-11-19")).toEqual(buildBriefPortfolio(base(), "2026-11-19")); });
});

describe("bilingual manual review text", () => {
  it("keeps UNKNOWN in English", () => { const x = buildBriefReviewPlan(base(), "brief-1", "2026-11-19"); if (!x) throw Error("missing"); expect(briefReviewText(x, "en")).toContain("UNKNOWN"); });
  it("keeps UNKNOWN in French", () => { const x = buildBriefReviewPlan(base(), "brief-1", "2026-11-19"); if (!x) throw Error("missing"); expect(briefReviewText(x, "fr")).toContain("UNKNOWN"); });
  it("includes the actual pack id", () => { const x = buildBriefReviewPlan(base(), "brief-1", "2026-11-19"); if (!x) throw Error("missing"); expect(briefReviewText(x, "en")).toContain("pack-a"); });
  it("never claims the pack can be used", () => { const x = buildBriefReviewPlan(base(), "brief-1", "2026-11-19"); if (!x) throw Error("missing"); expect(briefReviewText(x, "en")).toContain("never confirms"); });
  it("uses French nonbreaking colon spacing", () => { const x = buildBriefReviewPlan(base(), "brief-1", "2026-11-19"); if (!x) throw Error("missing"); expect(briefReviewText(x, "fr")).toContain("\u00a0:"); });
  it("has bilingual handoff topic labels", () => { expect(briefTopicLabels("en").handoff).toBe("Handoff"); expect(briefTopicLabels("fr").handoff).toBe("Transfert"); });
  it("does not invent a phone number or email address", () => { const x = buildBriefReviewPlan(base(), "brief-1", "2026-11-19"); if (!x) throw Error("missing"); expect(briefReviewText(x, "en")).not.toContain("@"); });
});
