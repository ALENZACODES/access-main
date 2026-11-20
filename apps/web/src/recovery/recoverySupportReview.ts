import { briefCoverage, briefFindings, briefQuestionsFor, type BriefFindingCode } from "./recoverySupportAnalysis";
import { BRIEF_TOPICS, type BriefDocument, type BriefQuestionTopic } from "./recoverySupportBrief";
export interface BriefTopicReview {
  readonly topic: BriefQuestionTopic;
  readonly recorded: number;
  readonly answered: number;
  readonly open: number;
  readonly status: "UNKNOWN" | "recorded" | "unanswered";
}
export interface BriefReviewPlan {
  readonly briefId: string;
  readonly packId: string;
  readonly topics: readonly BriefTopicReview[];
  readonly outstanding: readonly BriefQuestionTopic[];
  readonly contradictory: boolean;
  readonly sourceOlderThan90Days: boolean;
  readonly nextSteps: readonly string[];
  readonly contentReady: false;
}
/** Describes coverage of the user's own notes; does not judge the pack or suggest automatic changes. */
export function buildBriefReviewPlan(document: BriefDocument, briefId: string, asOf: string): BriefReviewPlan | null {
  const brief = document.briefs.find((item) => item.id === briefId);
  if (!brief) return null;
  const counts = briefCoverage(document, briefId);
  const questions = briefQuestionsFor(document, briefId);
  const topics: BriefTopicReview[] = BRIEF_TOPICS.map((topic) => {
    const relevant = questions.filter((item) => item.topic === topic);
    const answered = relevant.filter((item) => item.state === "answered").length;
    return { topic, recorded: counts[topic], answered, open: relevant.length - answered,
      status: relevant.length === 0 ? "UNKNOWN" : answered === relevant.length ? "recorded" : "unanswered" };
  });
  const findings = briefFindings(document, asOf).filter((finding) => finding.briefId === briefId);
  const codes = new Set<BriefFindingCode>(findings.map((finding) => finding.code));
  const nextSteps: string[] = [];
  if (codes.has("conflicting-observation")) nextSteps.push("Compare the conflicting observations before sharing a conclusion.");
  if (codes.has("missing-observation")) nextSteps.push("Record what happened and identify the source of that observation.");
  if (codes.has("unknown-condition")) nextSteps.push("Keep the recorded condition as UNKNOWN until reliable evidence is supplied.");
  if (codes.has("unanswered-question")) nextSteps.push("Review unanswered questions with the recipient of the handoff.");
  if (codes.has("stale-source")) nextSteps.push("Check the retrieval date and seek an updated source when practical.");
  if (brief.state !== "archived") nextSteps.push("Decide whether to request a manual review or retain the draft.");
  if (nextSteps.length === 0) nextSteps.push("Keep the documented notes available for later manual reference.");
  return { briefId: brief.id, packId: brief.packId, topics,
    outstanding: topics.filter((item) => item.status !== "recorded").map((item) => item.topic),
    contradictory: codes.has("conflicting-observation"),
    sourceOlderThan90Days: codes.has("stale-source"),
    nextSteps,
    contentReady: false };
}
export interface BriefPortfolio {
  readonly total: number;
  readonly withUnansweredQuestions: number;
  readonly withConflicts: number;
  readonly withUnknownConditions: number;
  readonly ordered: readonly BriefReviewPlan[];
  readonly contentReady: false;
}
export function buildBriefPortfolio(document: BriefDocument, asOf: string): BriefPortfolio {
  const plans = document.briefs.map((item) => buildBriefReviewPlan(document, item.id, asOf)).filter((item): item is BriefReviewPlan => item !== null);
  const score = (item: BriefReviewPlan): number => Number(item.contradictory) * 100 + item.outstanding.length * 10 + Number(item.sourceOlderThan90Days);
  return {
    total: plans.length,
    withUnansweredQuestions: plans.filter((item) => item.topics.some((topic) => topic.open > 0)).length,
    withConflicts: plans.filter((item) => item.contradictory).length,
    withUnknownConditions: document.briefs.filter((item) => item.condition === "UNKNOWN").length,
    ordered: [...plans].sort((a, b) => score(b) - score(a) || a.briefId.localeCompare(b.briefId)),
    contentReady: false,
  };
}
export function briefTopicLabels(locale: "en" | "fr"): Readonly<Record<BriefQuestionTopic, string>> {
  return locale === "fr" ? {
    "what-happened": "Ce qui s’est passé", "missing-evidence": "Preuve manquante", source: "Source",
    "next-step": "Prochaine étape", handoff: "Transfert",
  } : {
    "what-happened": "What happened", "missing-evidence": "Missing evidence", source: "Source",
    "next-step": "Next step", handoff: "Handoff",
  };
}
export function briefReviewText(plan: BriefReviewPlan, locale: "en" | "fr"): string {
  const labels = briefTopicLabels(locale);
  const lines = locale === "fr"
    ? [`Dossier ${plan.briefId}`, `Ensemble\u00a0: ${plan.packId}`]
    : [`Brief ${plan.briefId}`, `Pack: ${plan.packId}`];
  for (const topic of plan.topics) lines.push(`${labels[topic.topic]}: ${topic.status === "UNKNOWN" ? "UNKNOWN" : `${topic.answered}/${topic.recorded}`}`);
  lines.push(locale === "fr" ? "Ce bilan ne confirme jamais qu’un ensemble est utilisable." : "This summary never confirms a pack is usable.");
  return lines.join("\n");
}
