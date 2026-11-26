import { recoverySupportCopy } from "./recoverySupportCopy";
import {
  briefSummary, type BriefCondition, type BriefDocument,
  type BriefObservation, type BriefQuestion, type BriefQuestionTopic, type BriefSource,
} from "./recoverySupportBrief";
export type BriefFindingCode = "unknown-condition" | "missing-observation" | "unanswered-question" | "disputed-answer" | "conflicting-observation" | "stale-source" | "unfinished-review";
export interface BriefFinding {
  readonly briefId: string;
  readonly code: BriefFindingCode;
  readonly level: "high" | "medium" | "low";
  readonly detail: string;
}
export interface BriefGroup {
  readonly packId: string;
  readonly briefIds: readonly string[];
  readonly conditions: readonly BriefCondition[];
  readonly unanswered: number;
  readonly findings: number;
  readonly contentReady: false;
}
export interface BriefReviewItem {
  readonly briefId: string;
  readonly packId: string;
  readonly title: string;
  readonly priority: "high" | "medium" | "low";
  readonly reasons: readonly BriefFindingCode[];
  readonly contentReady: false;
}
export interface BriefComparison {
  readonly briefId: string;
  readonly newObservations: readonly string[];
  readonly missingObservations: readonly string[];
  readonly changedObservations: readonly string[];
  readonly newQuestions: readonly string[];
  readonly changedQuestions: readonly string[];
  readonly contentReady: false;
}
export interface BriefReport {
  readonly asOf: string;
  readonly briefs: number;
  readonly questions: number;
  readonly unknown: number;
  readonly findings: readonly BriefFinding[];
  readonly reviews: readonly BriefReviewItem[];
  readonly contentReady: false;
}
const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
const compare = (a: string, b: string): number => a.localeCompare(b);
export function briefObservationsFor(document: BriefDocument, briefId: string): BriefObservation[] {
  return document.observations.filter((item) => item.briefId === briefId).sort((a, b) => compare(a.capturedAt, b.capturedAt));
}
export function briefQuestionsFor(document: BriefDocument, briefId: string): BriefQuestion[] {
  return document.questions.filter((item) => item.briefId === briefId).sort((a, b) => compare(a.capturedAt, b.capturedAt));
}
export function briefSourceAge(source: BriefSource, asOf: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(asOf) || source.retrievedOn > asOf) return null;
  const start = Date.parse(`${source.retrievedOn}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86_400_000) : null;
}
export function briefFindings(document: BriefDocument, asOf: string): BriefFinding[] {
  const findings: BriefFinding[] = [];
  for (const entry of document.briefs) {
    const observations = briefObservationsFor(document, entry.id);
    const questions = briefQuestionsFor(document, entry.id);
    const add = (code: BriefFindingCode, level: BriefFinding["level"], detail: string): void => {
      findings.push({ briefId: entry.id, code, level, detail });
    };
    if (entry.condition === "UNKNOWN") add("unknown-condition", "medium", "Condition remains UNKNOWN");
    if (observations.length === 0) add("missing-observation", "medium", "No observations have been entered");
    if (entry.state !== "archived") add("unfinished-review", "low", "Review remains open");
    const age = briefSourceAge(entry.source, asOf);
    if (age !== null && age > 90) add("stale-source", "low", "Source retrieval is over ninety days old");
    for (const question of questions) {
      if (question.state === "UNKNOWN" || question.state === "open") add("unanswered-question", "medium", question.id);
      if (question.state === "deferred") add("disputed-answer", "low", question.id);
      const days = briefSourceAge(question.source, asOf);
      if (days !== null && days > 90) add("stale-source", "low", question.id);
    }
    const byDate = new Map<string, Set<BriefCondition>>();
    for (const item of observations) {
      const day = item.capturedAt.slice(0, 10);
      const conditions = byDate.get(day) ?? new Set<BriefCondition>();
      conditions.add(item.condition);
      byDate.set(day, conditions);
      const days = briefSourceAge(item.source, asOf);
      if (days !== null && days > 90) add("stale-source", "low", item.id);
    }
    if ([...byDate.values()].some((values) => values.size > 1)) {
      add("conflicting-observation", "high", "Different conditions were recorded on the same date");
    }
  }
  const rank: Record<BriefFinding["level"], number> = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => rank[a.level] - rank[b.level] || compare(a.briefId, b.briefId) || compare(a.code, b.code));
}
export function groupBriefs(document: BriefDocument, asOf: string): BriefGroup[] {
  const findings = briefFindings(document, asOf);
  return unique(document.briefs.map((entry) => entry.packId)).sort(compare).map((packId) => {
    const briefs = document.briefs.filter((entry) => entry.packId === packId);
    const ids = briefs.map((entry) => entry.id);
    return {
      packId,
      briefIds: ids.sort(compare),
      conditions: unique(briefs.map((entry) => entry.condition)).sort(compare),
      unanswered: document.questions.filter((item) => ids.includes(item.briefId) && item.state !== "answered").length,
      findings: findings.filter((item) => ids.includes(item.briefId)).length,
      contentReady: false,
    };
  });
}
export function briefReviewQueue(document: BriefDocument, asOf: string): BriefReviewItem[] {
  const findings = briefFindings(document, asOf);
  const rank: Record<BriefReviewItem["priority"], number> = { high: 0, medium: 1, low: 2 };
  return document.briefs.flatMap((entry) => {
    const related = findings.filter((finding) => finding.briefId === entry.id);
    if (related.length === 0) return [];
    return [{ briefId: entry.id, packId: entry.packId, title: entry.title,
      priority: related.some((item) => item.level === "high") ? "high" as const
        : related.some((item) => item.level === "medium") ? "medium" as const : "low" as const,
      reasons: unique(related.map((item) => item.code)), contentReady: false as const }];
  }).sort((a, b) => rank[a.priority] - rank[b.priority] || compare(a.briefId, b.briefId));
}
export function briefCoverage(document: BriefDocument, briefId: string): Record<BriefQuestionTopic, number> {
  const topics: BriefQuestionTopic[] = ["what-happened", "missing-evidence", "source", "next-step", "handoff"];
  const items = briefQuestionsFor(document, briefId);
  return Object.fromEntries(topics.map((topic) => [topic, items.filter((item) => item.topic === topic).length])) as Record<BriefQuestionTopic, number>;
}
export function compareBriefs(a: BriefDocument, b: BriefDocument, briefId: string): BriefComparison {
  const left = briefObservationsFor(a, briefId);
  const right = briefObservationsFor(b, briefId);
  const original = new Map(left.map((item) => [item.id, JSON.stringify(item)]));
  const incoming = new Map(right.map((item) => [item.id, JSON.stringify(item)]));
  const questions = briefQuestionsFor(a, briefId);
  const later = briefQuestionsFor(b, briefId);
  const before = new Map(questions.map((item) => [item.id, JSON.stringify(item)]));
  return {
    briefId,
    newObservations: right.filter((item) => !original.has(item.id)).map((item) => item.id),
    missingObservations: left.filter((item) => !incoming.has(item.id)).map((item) => item.id),
    changedObservations: right.filter((item) => original.has(item.id) && original.get(item.id) !== JSON.stringify(item)).map((item) => item.id),
    newQuestions: later.filter((item) => !before.has(item.id)).map((item) => item.id),
    changedQuestions: later.filter((item) => before.has(item.id) && before.get(item.id) !== JSON.stringify(item)).map((item) => item.id),
    contentReady: false,
  };
}
export function briefReport(document: BriefDocument, asOf: string): BriefReport {
  const summary = briefSummary(document);
  return { asOf, briefs: summary.briefs, questions: summary.questions, unknown: summary.unknown,
    findings: briefFindings(document, asOf), reviews: briefReviewQueue(document, asOf), contentReady: false };
}
export function briefNarrative(document: BriefDocument, asOf: string, locale: "en" | "fr"): string {
  const report = briefReport(document, asOf);
  const copy = recoverySupportCopy(locale);
  const separator = locale === "fr" ? "\u00a0: " : ": ";
  const lines = locale === "fr"
    ? [`Résumé de récupération — ${asOf}`, `Dossiers\u00a0: ${report.briefs}`, `Questions\u00a0: ${report.questions}`, `Valeurs UNKNOWN\u00a0: ${report.unknown}`, `Points à examiner\u00a0: ${report.findings.length}`,
      "Ces notes ne confirment pas que les ensembles sont utilisables."]
    : [`Recovery support brief — ${asOf}`, `Cases: ${report.briefs}`, `Questions: ${report.questions}`, `UNKNOWN values: ${report.unknown}`, `Review findings: ${report.findings.length}`,
      "These notes do not establish that any pack is usable."];
  for (const entry of document.briefs) {
    const item = `${entry.packId} — ${entry.title} (${copy.conditions[entry.condition]}, ${copy.states[entry.state]})`;
    lines.push(item);
    for (const question of briefQuestionsFor(document, entry.id)) {
      lines.push(`- ${copy.topics[question.topic]}${separator}${question.question} [${copy.questionStates[question.state]}]`);
    }
  }
  return lines.join("\n");
}
