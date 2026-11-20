import {
  REFRESH_TOPICS, checkRefreshDocument, latestRefreshObservation,
  latestRefreshReview, refreshReviewCurrent, refreshCalendarDay, refreshObservationsFor,
  refreshReviewsFor, type RefreshCondition, type RefreshDocument,
  type RefreshObservation, type RefreshTopic,
} from "./recoverySourceRefresh";

export type RefreshFindingCode =
  | "no-observation" | "unknown-condition" | "unavailable" | "needs-review"
  | "unknown-tier" | "age-unknown" | "older-than-window" | "conflicting-observations"
  | "unreviewed" | "future-source-date" | "review-reopened";
export interface RefreshFinding {
  readonly subjectId: string;
  readonly packId: string;
  readonly code: RefreshFindingCode;
  readonly severity: "high" | "medium" | "low";
  readonly detail: string;
}
export interface RefreshReviewRow {
  readonly subjectId: string;
  readonly packId: string;
  readonly title: string;
  readonly condition: RefreshCondition;
  readonly ageDays: number | null;
  readonly lastRetrievedOn: string | null;
  readonly priority: "high" | "medium" | "low";
  readonly findings: readonly RefreshFindingCode[];
  readonly manuallyReviewed: boolean;
  readonly contentReady: false;
}
export interface RefreshAgeBucket {
  readonly key: "UNKNOWN" | "current-window" | "older-than-window";
  readonly count: number;
  readonly subjectIds: readonly string[];
}
export interface RefreshPackOverview {
  readonly packId: string;
  readonly total: number;
  readonly unknown: number;
  readonly older: number;
  readonly outstanding: number;
  readonly highPriority: number;
  readonly contentReady: false;
}
export interface RefreshTopicOverview {
  readonly topic: RefreshTopic;
  readonly total: number;
  readonly unknown: number;
  readonly outstanding: number;
}
export interface RefreshTimelinePoint {
  readonly day: string;
  readonly observations: number;
  readonly reviews: number;
  readonly subjects: number;
}
export interface RefreshWindowOptions {
  readonly asOf: string;
  /** User-selected review window; not a regulatory or clinical threshold. */
  readonly windowDays: 30 | 90 | 180 | 365;
}
export interface RefreshReviewReport {
  readonly asOf: string;
  readonly windowDays: number;
  readonly subjects: number;
  readonly findings: readonly RefreshFinding[];
  readonly queue: readonly RefreshReviewRow[];
  readonly packs: readonly RefreshPackOverview[];
  readonly ageBuckets: readonly RefreshAgeBucket[];
  readonly contentReady: false;
}
export interface RefreshSubjectComparison {
  readonly subjectId: string;
  readonly changes: readonly string[];
  readonly leftObservations: number;
  readonly rightObservations: number;
  readonly contentReady: false;
}
const alpha = (a: string, b: string): number => a.localeCompare(b);
const uniq = <T>(items: readonly T[]): T[] => [...new Set(items)];
const ranks = { high: 0, medium: 1, low: 2 } as const;
function dateAge(from: string | null, to: string): number | null {
  if (!from || !refreshCalendarDay(from) || !refreshCalendarDay(to)) return null;
  const elapsed = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`);
  return elapsed < 0 ? null : Math.floor(elapsed / 86_400_000);
}
export function sourceAgeDays(retrievedOn: string | null, asOf: string): number | null {
  return dateAge(retrievedOn, asOf);
}
export function refreshConflictPairs(observations: readonly RefreshObservation[]): readonly [string, string][] {
  const sorted = [...observations].sort((a, b) => alpha(a.observedAt, b.observedAt) || alpha(a.id, b.id));
  const result: [string, string][] = [];
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i];
    const b = sorted[j];
    if (!a || !b || a.condition === "UNKNOWN" || b.condition === "UNKNOWN") continue;
    // A later observation alone does not erase an earlier incompatible source claim.
    if (a.condition !== b.condition && a.source.reference !== b.source.reference) result.push([a.id, b.id]);
  }
  return result;
}
const itemFinding = (subjectId: string, packId: string, code: RefreshFindingCode, severity: RefreshFinding["severity"], detail: string): RefreshFinding =>
  ({ subjectId, packId, code, severity, detail });
export function refreshFindings(doc: RefreshDocument, options: RefreshWindowOptions): readonly RefreshFinding[] {
  if (!checkRefreshDocument(doc) || !refreshCalendarDay(options.asOf)) return [];
  const findings: RefreshFinding[] = [];
  for (const subject of doc.subjects) {
    const observations = refreshObservationsFor(doc, subject.id);
    const latest = latestRefreshObservation(doc, subject.id);
    const review = latestRefreshReview(doc, subject.id);
    const add = (code: RefreshFindingCode, severity: RefreshFinding["severity"], detail: string): void => {
      findings.push(itemFinding(subject.id, subject.packId, code, severity, detail));
    };
    if (!latest) {
      add("no-observation", "medium", "No user-supplied observation is recorded for this item");
      add("age-unknown", "medium", "No source date is available");
    } else {
      if (latest.condition === "UNKNOWN") add("unknown-condition", "medium", "The observed condition remains UNKNOWN");
      if (latest.condition === "unavailable") add("unavailable", "high", "The supplied observation reports unavailable data");
      if (latest.condition === "needs-review") add("needs-review", "medium", "The supplied observation requests further review");
      if (latest.source.tier === "UNKNOWN") add("unknown-tier", "medium", "The supplied evidence tier remains UNKNOWN");
      const age = sourceAgeDays(latest.source.retrievedOn, options.asOf);
      if (age === null) add("age-unknown", "medium", "Source age cannot be calculated for this reference day");
      else if (age > options.windowDays) add("older-than-window", "medium", "Source date precedes the selected manual review window");
      if (latest.source.retrievedOn > options.asOf) add("future-source-date", "high", "Source retrieval is later than the selected review day");
    }
    const pairs = refreshConflictPairs(observations);
    if (pairs.length > 0) add("conflicting-observations", "high", "Observations from different references report different conditions");
    if (review?.decision === "reopened") add("review-reopened", "medium", "A documented review was reopened");
    if (!refreshReviewCurrent(doc, subject.id)) add("unreviewed", "low", "No current manual review covers the latest observation");
  }
  return findings.sort((a, b) => alpha(a.packId, b.packId) || alpha(a.subjectId, b.subjectId) || ranks[a.severity] - ranks[b.severity] || alpha(a.code, b.code));
}
export function refreshReviewQueue(doc: RefreshDocument, options: RefreshWindowOptions): readonly RefreshReviewRow[] {
  const findings = refreshFindings(doc, options);
  return doc.subjects.map((subject) => {
    const local = findings.filter((f) => f.subjectId === subject.id);
    const latest = latestRefreshObservation(doc, subject.id);
    const priority: RefreshReviewRow["priority"] = local.some((f) => f.severity === "high") ? "high"
      : local.some((f) => f.severity === "medium") ? "medium" : "low";
    return {
      subjectId: subject.id, packId: subject.packId, title: subject.title,
      condition: latest?.condition ?? "UNKNOWN", ageDays: latest ? sourceAgeDays(latest.source.retrievedOn, options.asOf) : null,
      lastRetrievedOn: latest?.source.retrievedOn ?? null, priority,
      findings: local.map((f) => f.code), manuallyReviewed: refreshReviewCurrent(doc, subject.id), contentReady: false as const,
    };
  }).sort((a, b) => ranks[a.priority] - ranks[b.priority] || alpha(a.packId, b.packId) || alpha(a.subjectId, b.subjectId));
}
export function refreshPackOverviews(doc: RefreshDocument, options: RefreshWindowOptions): readonly RefreshPackOverview[] {
  const queue = refreshReviewQueue(doc, options);
  return uniq(queue.map((x) => x.packId)).sort(alpha).map((packId) => {
    const rows = queue.filter((row) => row.packId === packId);
    return {
      packId, total: rows.length, unknown: rows.filter((x) => x.condition === "UNKNOWN").length,
      older: rows.filter((x) => x.findings.includes("older-than-window")).length,
      outstanding: rows.filter((x) => !x.manuallyReviewed).length,
      highPriority: rows.filter((x) => x.priority === "high").length,
      contentReady: false,
    };
  });
}
export function refreshTopicOverviews(doc: RefreshDocument): readonly RefreshTopicOverview[] {
  return REFRESH_TOPICS.map((topic) => {
    const rows = doc.subjects.filter((s) => s.topic === topic);
    return {
      topic, total: rows.length,
      unknown: rows.filter((s) => (latestRefreshObservation(doc, s.id)?.condition ?? "UNKNOWN") === "UNKNOWN").length,
      outstanding: rows.filter((s) => !refreshReviewCurrent(doc, s.id)).length,
    };
  });
}
export function refreshAgeBuckets(doc: RefreshDocument, options: RefreshWindowOptions): readonly RefreshAgeBucket[] {
  const groups: Record<RefreshAgeBucket["key"], string[]> = { UNKNOWN: [], "current-window": [], "older-than-window": [] };
  for (const subject of doc.subjects) {
    const obs = latestRefreshObservation(doc, subject.id);
    const age = sourceAgeDays(obs?.source.retrievedOn ?? null, options.asOf);
    const key: RefreshAgeBucket["key"] = age === null ? "UNKNOWN" : age > options.windowDays ? "older-than-window" : "current-window";
    groups[key].push(subject.id);
  }
  return (["UNKNOWN", "current-window", "older-than-window"] as const).map((key) => ({
    key, count: groups[key].length, subjectIds: groups[key].sort(alpha),
  }));
}
export function refreshTimeline(doc: RefreshDocument): readonly RefreshTimelinePoint[] {
  const dates = uniq([...doc.subjects.map((x) => x.startedAt.slice(0, 10)),
    ...doc.observations.map((x) => x.observedAt.slice(0, 10)), ...doc.reviews.map((x) => x.at.slice(0, 10))]).sort(alpha);
  return dates.map((day) => ({
    day, subjects: doc.subjects.filter((x) => x.startedAt.startsWith(day)).length,
    observations: doc.observations.filter((x) => x.observedAt.startsWith(day)).length,
    reviews: doc.reviews.filter((x) => x.at.startsWith(day)).length,
  }));
}
export function compareRefreshSubject(left: RefreshDocument, right: RefreshDocument, subjectId: string): RefreshSubjectComparison {
  const leftSubject = left.subjects.find((s) => s.id === subjectId);
  const rightSubject = right.subjects.find((s) => s.id === subjectId);
  const a = refreshObservationsFor(left, subjectId);
  const b = refreshObservationsFor(right, subjectId);
  const changes: string[] = [];
  if (!leftSubject && rightSubject) changes.push("subject-added");
  if (leftSubject && !rightSubject) changes.push("subject-removed");
  if (leftSubject && rightSubject && JSON.stringify(leftSubject) !== JSON.stringify(rightSubject)) changes.push("subject-changed");
  for (const observation of a) {
    const paired = b.find((x) => x.id === observation.id);
    if (!paired) changes.push(`removed:${observation.id}`);
    else if (JSON.stringify(paired) !== JSON.stringify(observation)) changes.push(`changed:${observation.id}`);
  }
  for (const observation of b) if (!a.some((x) => x.id === observation.id)) changes.push(`added:${observation.id}`);
  if (refreshReviewsFor(left, subjectId).length !== refreshReviewsFor(right, subjectId).length) changes.push("review-count-changed");
  return { subjectId, leftObservations: a.length, rightObservations: b.length, changes: changes.sort(alpha), contentReady: false };
}
export function refreshReport(doc: RefreshDocument, options: RefreshWindowOptions): RefreshReviewReport {
  const queue = refreshReviewQueue(doc, options);
  return {
    asOf: options.asOf, windowDays: options.windowDays, subjects: doc.subjects.length,
    findings: refreshFindings(doc, options), queue,
    packs: refreshPackOverviews(doc, options), ageBuckets: refreshAgeBuckets(doc, options), contentReady: false,
  };
}
export function refreshNarrative(doc: RefreshDocument, options: RefreshWindowOptions, locale: "en" | "fr"): string {
  const report = refreshReport(doc, options);
  const fr = locale === "fr";
  const colon = fr ? "\u00a0: " : ": ";
  return [
    fr ? "Dossier de suivi des sources" : "Source refresh review",
    `${fr ? "Date de référence" : "Reference day"}${colon}${options.asOf}`,
    `${fr ? "Fenêtre choisie (jours)" : "Selected review window (days)"}${colon}${options.windowDays}`,
    `${fr ? "Dossiers" : "Items"}${colon}${report.subjects}`,
    `${fr ? "Constats" : "Findings"}${colon}${report.findings.length}`,
    `${fr ? "Dates de source UNKNOWN" : "UNKNOWN source ages"}${colon}${report.ageBuckets.find((x) => x.key === "UNKNOWN")?.count ?? 0}`,
    fr ? "Une date récente ne confirme pas que les données sont utilisables." : "A recent date does not establish that the data can be used.",
  ].join("\n");
}
