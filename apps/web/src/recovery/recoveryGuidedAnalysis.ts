import {
  GUIDED_TOPICS, guidedEventsFor, guidedStepsFor, guidedSummary,
  type GuidedCase, type GuidedDocument, type GuidedEvidence, type GuidedLocale,
  type GuidedTopic, type GuidedTier,
} from "./recoveryGuidedReview";

export type GuidedFindingCode = "unknown-condition" | "unknown-source" | "unknown-evidence" | "disputed" | "missing-topic" | "needs-action" | "stale-source" | "no-steps" | "open-review";
export interface GuidedFinding {
  readonly caseId: string;
  readonly packId: string;
  readonly code: GuidedFindingCode;
  readonly topic: GuidedTopic | null;
  readonly priority: "high" | "medium" | "low";
  readonly contentReady: false;
}
export interface GuidedTopicStatus {
  readonly topic: GuidedTopic;
  readonly count: number;
  readonly evidence: GuidedEvidence | "not-recorded";
  readonly hasDispute: boolean;
  readonly hasUnknown: boolean;
  readonly contentReady: false;
}
export interface GuidedPackReview {
  readonly packId: string;
  readonly cases: number;
  readonly steps: number;
  readonly unresolved: number;
  readonly unknown: number;
  readonly disputed: number;
  readonly contentReady: false;
}
export interface GuidedReviewPlan {
  readonly caseId: string;
  readonly packId: string;
  readonly priority: "high" | "medium" | "low";
  readonly codes: readonly GuidedFindingCode[];
  readonly topics: readonly GuidedTopic[];
  readonly contentReady: false;
}
export interface GuidedComparison {
  readonly packId: string;
  readonly addedCases: readonly string[];
  readonly removedCases: readonly string[];
  readonly changedCases: readonly string[];
  readonly addedSteps: readonly string[];
  readonly removedSteps: readonly string[];
  readonly contentReady: false;
}
export interface GuidedSourceGroup {
  readonly key: string;
  readonly tier: GuidedTier;
  readonly licence: string;
  readonly retrievalDate: string;
  readonly cases: number;
}
export interface GuidedDailyGroup {
  readonly day: string;
  readonly casesOpened: number;
  readonly observations: number;
  readonly manualEvents: number;
}
export interface GuidedReport {
  readonly asOf: string;
  readonly totalCases: number;
  readonly openCases: number;
  readonly findings: readonly GuidedFinding[];
  readonly reviews: readonly GuidedReviewPlan[];
  readonly packs: readonly GuidedPackReview[];
  readonly contentReady: false;
}
const byText = (a: string, b: string): number => a.localeCompare(b);
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const day = (stamp: string): string => stamp.slice(0, 10);
const highest = (a: "high" | "medium" | "low", b: "high" | "medium" | "low"): "high" | "medium" | "low" => {
  const ranks = { high: 0, medium: 1, low: 2 };
  return ranks[a] <= ranks[b] ? a : b;
};

/** Reports missing observations, never permissions to act or a claim that a pack works. */
export function guidedTopicStatus(document: GuidedDocument, caseId: string): readonly GuidedTopicStatus[] {
  const steps = guidedStepsFor(document, caseId);
  return GUIDED_TOPICS.map((topic) => {
    const matches = steps.filter((step) => step.topic === topic);
    const latest = matches.at(-1);
    return {
      topic, count: matches.length,
      evidence: latest?.evidence ?? "not-recorded",
      hasDispute: matches.some((step) => step.evidence === "disputed"),
      hasUnknown: matches.some((step) => step.evidence === "UNKNOWN"),
      contentReady: false,
    };
  });
}
export function guidedFindings(document: GuidedDocument, asOf: string): readonly GuidedFinding[] {
  const result: GuidedFinding[] = [];
  const emit = (item: GuidedCase, code: GuidedFindingCode, priority: GuidedFinding["priority"], topic: GuidedTopic | null = null): void => {
    result.push({ caseId: item.id, packId: item.packId, code, priority, topic, contentReady: false });
  };
  for (const item of document.cases) {
    const steps = guidedStepsFor(document, item.id);
    const topics = guidedTopicStatus(document, item.id);
    if (item.condition === "UNKNOWN") emit(item, "unknown-condition", "medium");
    if (item.source.tier === "UNKNOWN") emit(item, "unknown-source", "medium");
    if (steps.length === 0) emit(item, "no-steps", "medium");
    if (item.phase === "review") emit(item, "open-review", "medium");
    if (item.source.retrievedOn < asOf && Number.isFinite(Date.parse(asOf)) && (Date.parse(asOf) - Date.parse(item.source.retrievedOn)) > 180 * 86400000) emit(item, "stale-source", "low");
    for (const topic of topics) if (topic.count === 0) emit(item, "missing-topic", "low", topic.topic);
    for (const step of steps) {
      if (step.evidence === "UNKNOWN") emit(item, "unknown-evidence", "medium", step.topic);
      if (step.evidence === "disputed") emit(item, "disputed", "high", step.topic);
      if (step.outcome === "needs-action") emit(item, "needs-action", "high", step.topic);
    }
  }
  return result.sort((a, b) => byText(a.caseId, b.caseId) || byText(a.code, b.code) || byText(a.topic ?? "", b.topic ?? ""));
}
export function guidedReviewPlan(document: GuidedDocument, asOf: string): readonly GuidedReviewPlan[] {
  const findings = guidedFindings(document, asOf);
  const result: GuidedReviewPlan[] = [];
  for (const item of document.cases) {
    const related = findings.filter((f) => f.caseId === item.id);
    if (related.length === 0) continue;
    result.push({ caseId: item.id, packId: item.packId, priority: related.reduce((p, f) => highest(p, f.priority), "low" as GuidedFinding["priority"]),
      codes: unique(related.map((f) => f.code)).sort(byText), topics: unique(related.map((f) => f.topic).filter((t): t is GuidedTopic => t !== null)).sort(byText), contentReady: false });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return result.sort((a, b) => rank[a.priority] - rank[b.priority] || byText(a.caseId, b.caseId));
}
export function guidedPackReviews(document: GuidedDocument): readonly GuidedPackReview[] {
  return unique(document.cases.map((c) => c.packId)).sort(byText).map((packId) => {
    const cases = document.cases.filter((c) => c.packId === packId);
    const ids = new Set(cases.map((c) => c.id));
    const steps = document.steps.filter((s) => ids.has(s.caseId));
    return { packId, cases: cases.length, steps: steps.length,
      unresolved: cases.filter((c) => c.phase !== "closed").length,
      unknown: cases.filter((c) => c.condition === "UNKNOWN").length + steps.filter((s) => s.evidence === "UNKNOWN").length,
      disputed: steps.filter((s) => s.evidence === "disputed").length, contentReady: false };
  });
}
export function guidedSourceGroups(document: GuidedDocument): readonly GuidedSourceGroup[] {
  const counts = new Map<string, GuidedSourceGroup>();
  for (const item of document.cases) {
    const key = JSON.stringify([item.source.name, item.source.reference, item.source.licence, item.source.retrievedOn, item.source.tier]);
    const current = counts.get(key);
    counts.set(key, { key, tier: item.source.tier, licence: item.source.licence, retrievalDate: item.source.retrievedOn, cases: (current?.cases ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => byText(a.key, b.key));
}
export function guidedDailyGroups(document: GuidedDocument): readonly GuidedDailyGroup[] {
  const days = unique([
    ...document.cases.map((c) => day(c.openedAt)),
    ...document.steps.map((s) => day(s.capturedAt)),
    ...document.events.map((e) => day(e.at)),
  ]).sort(byText);
  return days.map((date) => ({ day: date,
    casesOpened: document.cases.filter((c) => day(c.openedAt) === date).length,
    observations: document.steps.filter((s) => day(s.capturedAt) === date).length,
    manualEvents: document.events.filter((e) => day(e.at) === date).length }));
}
export function compareGuidedPacks(before: GuidedDocument, after: GuidedDocument, packId: string): GuidedComparison {
  const left = before.cases.filter((c) => c.packId === packId);
  const right = after.cases.filter((c) => c.packId === packId);
  const beforeMap = new Map(left.map((c) => [c.id, JSON.stringify(c)]));
  const afterMap = new Map(right.map((c) => [c.id, JSON.stringify(c)]));
  const leftIds = new Set(left.map((c) => c.id));
  const rightIds = new Set(right.map((c) => c.id));
  const beforeSteps = before.steps.filter((s) => leftIds.has(s.caseId));
  const afterSteps = after.steps.filter((s) => rightIds.has(s.caseId));
  const beforeStepIds = new Set(beforeSteps.map((s) => s.id));
  const afterStepIds = new Set(afterSteps.map((s) => s.id));
  return { packId,
    addedCases: right.filter((c) => !beforeMap.has(c.id)).map((c) => c.id).sort(byText),
    removedCases: left.filter((c) => !afterMap.has(c.id)).map((c) => c.id).sort(byText),
    changedCases: right.filter((c) => beforeMap.has(c.id) && beforeMap.get(c.id) !== afterMap.get(c.id)).map((c) => c.id).sort(byText),
    addedSteps: afterSteps.filter((s) => !beforeStepIds.has(s.id)).map((s) => s.id).sort(byText),
    removedSteps: beforeSteps.filter((s) => !afterStepIds.has(s.id)).map((s) => s.id).sort(byText),
    contentReady: false };
}
export function createGuidedReport(document: GuidedDocument, asOf: string): GuidedReport {
  const counts = guidedSummary(document);
  return { asOf, totalCases: counts.cases, openCases: counts.open, findings: guidedFindings(document, asOf), reviews: guidedReviewPlan(document, asOf), packs: guidedPackReviews(document), contentReady: false };
}
export function guidedTimeline(document: GuidedDocument, caseId: string): readonly string[] {
  const parent = document.cases.find((c) => c.id === caseId);
  if (!parent) return [];
  return [
    `${parent.openedAt} | opened | ${parent.id}`,
    ...guidedStepsFor(document, caseId).map((step) => `${step.capturedAt} | ${step.topic} | ${step.evidence}`),
    ...guidedEventsFor(document, caseId).map((event) => `${event.at} | ${event.action} | ${event.note}`),
  ].sort(byText);
}
export function guidedNarrative(document: GuidedDocument, asOf: string, locale: GuidedLocale): string {
  const report = createGuidedReport(document, asOf);
  if (locale === "fr") return [
    `Examen manuel de récupération — ${asOf}`,
    `Dossiers\u00a0: ${report.totalCases}`,
    `Dossiers ouverts\u00a0: ${report.openCases}`,
    `Observations UNKNOWN\u00a0: ${guidedSummary(document).unknown}`,
    `Points à examiner\u00a0: ${report.findings.length}`,
    "Ce résumé ne confirme jamais qu’un ensemble est utilisable.",
  ].join("\n");
  return [
    `Manual recovery review — ${asOf}`,
    `Cases: ${report.totalCases}`,
    `Open cases: ${report.openCases}`,
    `UNKNOWN observations: ${guidedSummary(document).unknown}`,
    `Review findings: ${report.findings.length}`,
    "This summary does not confirm that any pack is usable.",
  ].join("\n");
}
