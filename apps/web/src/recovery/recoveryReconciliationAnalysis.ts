import {
  caseCurrentCondition, caseHasContradiction, eventsForCase, observationsForCase,
  reconciliationSummary, type ReconciliationCase, type ReconciliationCondition,
  type ReconciliationDocument, type ReconciliationDisposition,
  type ReconciliationOperation, type ReconciliationSource,
  type ReconciliationStatus, type ReconciliationTier,
} from "./recoveryReconciliation";

export type ReconciliationFindingCode =
  | "no-observations" | "unknown-condition" | "unknown-tier"
  | "contradiction" | "closed-unresolved" | "missing-recent-event"
  | "missing-review" | "dated-source" | "multiple-sources";
export interface ReconciliationFinding {
  readonly code: ReconciliationFindingCode;
  readonly caseId: string;
  readonly packId: string;
  readonly detail: string;
  readonly priority: "high" | "medium" | "low";
  readonly contentReady: false;
}
export interface ReconciliationPackGroup {
  readonly packId: string;
  readonly cases: number;
  readonly observations: number;
  readonly open: number;
  readonly closed: number;
  readonly unknown: number;
  readonly contradictions: number;
  readonly operations: readonly ReconciliationOperation[];
  readonly conditions: readonly ReconciliationCondition[];
  readonly sourceTiers: readonly ReconciliationTier[];
  readonly contentReady: false;
}
export interface ReconciliationSourceGroup {
  readonly key: string;
  readonly source: ReconciliationSource;
  readonly caseIds: readonly string[];
  readonly observationIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly contentReady: false;
}
export interface ReconciliationTimelineEntry {
  readonly id: string;
  readonly caseId: string;
  readonly kind: "case" | "observation" | "event";
  readonly at: string;
  readonly label: string;
  readonly condition: ReconciliationCondition;
  readonly contentReady: false;
}
export interface ReconciliationDateRange {
  readonly firstCase: string | null;
  readonly latestCase: string | null;
  readonly firstObservation: string | null;
  readonly latestObservation: string | null;
  readonly lastEvent: string | null;
  readonly earliestSource: string | null;
  readonly latestSource: string | null;
}
export interface ReconciliationDailyCount {
  readonly day: string;
  readonly cases: number;
  readonly observations: number;
  readonly events: number;
  readonly changedCases: number;
}
export interface ReconciliationCaseComparison {
  readonly id: string;
  readonly statusBefore: ReconciliationStatus | "ABSENT";
  readonly statusAfter: ReconciliationStatus | "ABSENT";
  readonly dispositionBefore: ReconciliationDisposition | "ABSENT";
  readonly dispositionAfter: ReconciliationDisposition | "ABSENT";
  readonly change: "added" | "removed" | "changed" | "same";
  readonly observationChange: number;
  readonly eventChange: number;
  readonly contentReady: false;
}
export interface ReconciliationReport {
  readonly generatedAt: string;
  readonly caseCount: number;
  readonly observationCount: number;
  readonly eventCount: number;
  readonly outstanding: number;
  readonly unknown: number;
  readonly contradictory: number;
  readonly findings: readonly ReconciliationFinding[];
  readonly groups: readonly ReconciliationPackGroup[];
  readonly contentReady: false;
}
export interface ReconciliationReviewStep {
  readonly key: string;
  readonly caseId: string;
  readonly priority: "high" | "medium" | "low";
  readonly description: string;
  readonly source: ReconciliationSource;
  readonly contentReady: false;
}
const distinct = <T>(list: readonly T[]): T[] => [...new Set(list)];
const alpha = (a: string, b: string): number => a.localeCompare(b);
const day = (instant: string): string => instant.slice(0, 10);
const sortDate = (items: readonly string[]): readonly string[] => [...items].sort(alpha);
const latest = (items: readonly string[]): string | null => sortDate(items).at(-1) ?? null;
const earliest = (items: readonly string[]): string | null => sortDate(items)[0] ?? null;
const groupCaseId = (items: readonly { readonly caseId: string }[], caseId: string): number => items.filter((i) => i.caseId === caseId).length;

/** Findings are review prompts only and never infer a physical accessibility condition. */
export function reconciliationFindings(document: ReconciliationDocument, asOfDay: string): readonly ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const push = (entry: ReconciliationCase, code: ReconciliationFindingCode, detail: string, priority: "high" | "medium" | "low"): void => {
    findings.push({ code, caseId: entry.id, packId: entry.packId, detail, priority, contentReady: false });
  };
  for (const entry of document.cases) {
    const observations = observationsForCase(document, entry.id);
    const events = eventsForCase(document, entry.id);
    if (observations.length === 0) push(entry, "no-observations", "No observation has been recorded", "high");
    if (caseHasContradiction(document, entry.id)) push(entry, "contradiction", "Recorded conditions disagree", "high");
    if (caseCurrentCondition(document, entry.id) === "UNKNOWN") push(entry, "unknown-condition", "Recorded condition remains UNKNOWN", "medium");
    if (entry.source.tier === "UNKNOWN" || observations.some((o) => o.source.tier === "UNKNOWN")) push(entry, "unknown-tier", "One or more source tiers remain UNKNOWN", "medium");
    if (entry.status === "closed" && (observations.length === 0 || caseHasContradiction(document, entry.id))) {
      push(entry, "closed-unresolved", "A closed record still contains unresolved observations", "high");
    }
    if (entry.status === "in-review" && !events.some((e) => e.action === "reviewed")) push(entry, "missing-review", "Review status lacks a matching activity entry", "medium");
    if (entry.status !== "open" && events.length === 0) push(entry, "missing-recent-event", "Status has no recorded activity", "medium");
    const dates = [entry.source.retrievedOn, ...observations.map((o) => o.source.retrievedOn)];
    if (/^\d{4}-\d{2}-\d{2}$/u.test(asOfDay) && dates.some((d) => d < asOfDay.slice(0, 4) + "-01-01")) {
      push(entry, "dated-source", "One or more source retrieval dates precede this calendar year", "low");
    }
    const sources = new Set([entry.source.reference, ...observations.map((o) => o.source.reference)]);
    if (sources.size > 1) push(entry, "multiple-sources", "Multiple source references require manual review", "low");
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => rank[a.priority] - rank[b.priority] || alpha(a.packId, b.packId) || alpha(a.caseId, b.caseId) || alpha(a.code, b.code));
}
export function reconciliationPackGroups(document: ReconciliationDocument): readonly ReconciliationPackGroup[] {
  const ids = distinct(document.cases.map((c) => c.packId)).sort(alpha);
  return ids.map((packId) => {
    const cases = document.cases.filter((c) => c.packId === packId);
    const caseIds = new Set(cases.map((c) => c.id));
    const observations = document.observations.filter((o) => caseIds.has(o.caseId));
    return {
      packId, cases: cases.length, observations: observations.length,
      open: cases.filter((c) => c.status !== "closed").length,
      closed: cases.filter((c) => c.status === "closed").length,
      unknown: cases.filter((c) => caseCurrentCondition(document, c.id) === "UNKNOWN").length,
      contradictions: cases.filter((c) => caseHasContradiction(document, c.id)).length,
      operations: distinct(cases.map((c) => c.operation)).sort(alpha),
      conditions: distinct(observations.map((o) => o.condition)).sort(alpha),
      sourceTiers: distinct([...cases.map((c) => c.source.tier), ...observations.map((o) => o.source.tier)]).sort(alpha),
      contentReady: false,
    };
  });
}
export function reconciliationSourceGroups(document: ReconciliationDocument): readonly ReconciliationSourceGroup[] {
  const indexed = new Map<string, { source: ReconciliationSource; cases: string[]; observations: string[]; events: string[] }>();
  const collect = (source: ReconciliationSource, type: "cases" | "observations" | "events", id: string): void => {
    const key = JSON.stringify([source.name, source.licence, source.retrievedOn, source.tier, source.reference]);
    let value = indexed.get(key);
    if (!value) { value = { source, cases: [], observations: [], events: [] }; indexed.set(key, value); }
    value[type].push(id);
  };
  for (const item of document.cases) collect(item.source, "cases", item.id);
  for (const item of document.observations) collect(item.source, "observations", item.id);
  for (const item of document.events) collect(item.source, "events", item.id);
  return [...indexed.entries()].map(([key, value]) => ({
    key, source: value.source,
    caseIds: value.cases.sort(alpha), observationIds: value.observations.sort(alpha), eventIds: value.events.sort(alpha),
    contentReady: false as const,
  })).sort((a, b) => alpha(a.key, b.key));
}
export function reconciliationTimeline(document: ReconciliationDocument, caseId?: string): readonly ReconciliationTimelineEntry[] {
  const cases: ReconciliationTimelineEntry[] = document.cases.filter((c) => caseId === undefined || c.id === caseId).map((c) => ({
    id: c.id, caseId: c.id, kind: "case", at: c.openedAt, label: c.title, condition: "UNKNOWN", contentReady: false,
  }));
  const observations: ReconciliationTimelineEntry[] = document.observations.filter((o) => caseId === undefined || o.caseId === caseId).map((o) => ({
    id: o.id, caseId: o.caseId, kind: "observation", at: o.recordedAt, label: o.note, condition: o.condition, contentReady: false,
  }));
  const events: ReconciliationTimelineEntry[] = document.events.filter((e) => caseId === undefined || e.caseId === caseId).map((e) => ({
    id: e.id, caseId: e.caseId, kind: "event", at: e.at, label: e.action, condition: "UNKNOWN", contentReady: false,
  }));
  return [...cases, ...observations, ...events].sort((a, b) => alpha(a.at, b.at) || alpha(a.kind, b.kind) || alpha(a.id, b.id));
}
export function reconciliationDateRange(document: ReconciliationDocument): ReconciliationDateRange {
  const sources = [...document.cases.map((c) => c.source.retrievedOn), ...document.observations.map((o) => o.source.retrievedOn), ...document.events.map((e) => e.source.retrievedOn)];
  return {
    firstCase: earliest(document.cases.map((c) => c.openedAt)),
    latestCase: latest(document.cases.map((c) => c.openedAt)),
    firstObservation: earliest(document.observations.map((o) => o.recordedAt)),
    latestObservation: latest(document.observations.map((o) => o.recordedAt)),
    lastEvent: latest(document.events.map((e) => e.at)),
    earliestSource: earliest(sources), latestSource: latest(sources),
  };
}
export function reconciliationDailyCounts(document: ReconciliationDocument): readonly ReconciliationDailyCount[] {
  const days = distinct([
    ...document.cases.map((c) => day(c.openedAt)),
    ...document.observations.map((o) => day(o.recordedAt)),
    ...document.events.map((e) => day(e.at)),
  ]).sort(alpha);
  return days.map((d) => ({
    day: d,
    cases: document.cases.filter((c) => day(c.openedAt) === d).length,
    observations: document.observations.filter((o) => day(o.recordedAt) === d).length,
    events: document.events.filter((e) => day(e.at) === d).length,
    changedCases: new Set([
      ...document.cases.filter((c) => day(c.openedAt) === d).map((c) => c.id),
      ...document.observations.filter((o) => day(o.recordedAt) === d).map((o) => o.caseId),
      ...document.events.filter((e) => day(e.at) === d).map((e) => e.caseId),
    ]).size,
  }));
}
export function compareReconciliationDocuments(left: ReconciliationDocument, right: ReconciliationDocument): readonly ReconciliationCaseComparison[] {
  const ids = distinct([...left.cases.map((c) => c.id), ...right.cases.map((c) => c.id)]).sort(alpha);
  return ids.map((id) => {
    const before = left.cases.find((c) => c.id === id);
    const after = right.cases.find((c) => c.id === id);
    const change = !before ? "added" : !after ? "removed" : JSON.stringify(before) === JSON.stringify(after) ? "same" : "changed";
    return {
      id, statusBefore: before?.status ?? "ABSENT", statusAfter: after?.status ?? "ABSENT",
      dispositionBefore: before?.disposition ?? "ABSENT", dispositionAfter: after?.disposition ?? "ABSENT",
      change,
      observationChange: groupCaseId(right.observations, id) - groupCaseId(left.observations, id),
      eventChange: groupCaseId(right.events, id) - groupCaseId(left.events, id),
      contentReady: false,
    };
  });
}
export function reconciliationReviewSteps(document: ReconciliationDocument, asOfDay: string): readonly ReconciliationReviewStep[] {
  const findings = reconciliationFindings(document, asOfDay);
  return findings.map((finding) => {
    const entry = document.cases.find((c) => c.id === finding.caseId);
    if (!entry) throw new Error("Internal case reference is missing");
    return {
      key: `${finding.caseId}:${finding.code}`, caseId: finding.caseId,
      priority: finding.priority, description: finding.detail, source: entry.source,
      contentReady: false,
    };
  });
}
export function reconciliationReport(document: ReconciliationDocument, asOfDay: string): ReconciliationReport {
  const summary = reconciliationSummary(document);
  return {
    generatedAt: asOfDay, caseCount: summary.cases, observationCount: summary.observations,
    eventCount: summary.events, outstanding: summary.open + summary.inReview + summary.deferred,
    unknown: summary.unknown, contradictory: summary.contradictions,
    findings: reconciliationFindings(document, asOfDay), groups: reconciliationPackGroups(document),
    contentReady: false,
  };
}
export function reconciliationTextReport(document: ReconciliationDocument, asOfDay: string, locale: "en" | "fr"): string {
  const report = reconciliationReport(document, asOfDay);
  const groups = report.groups.map((g) => `${g.packId}: ${g.cases} / ${g.unknown} UNKNOWN`).join("\n");
  if (locale === "fr") return [
    `Registre de rapprochement — ${asOfDay}`,
    `Dossiers\u00a0: ${report.caseCount}`,
    `Observations\u00a0: ${report.observationCount}`,
    `Évènements\u00a0: ${report.eventCount}`,
    `En attente\u00a0: ${report.outstanding}`,
    `Conditions UNKNOWN\u00a0: ${report.unknown}`,
    `Contradictions\u00a0: ${report.contradictory}`,
    groups,
    "Aucune observation ne confirme qu’un ensemble est utilisable.",
  ].join("\n");
  return [
    `Recovery reconciliation register — ${asOfDay}`,
    `Cases: ${report.caseCount}`,
    `Observations: ${report.observationCount}`,
    `Events: ${report.eventCount}`,
    `Pending: ${report.outstanding}`,
    `UNKNOWN conditions: ${report.unknown}`,
    `Contradictions: ${report.contradictory}`,
    groups,
    "No observation confirms an installed pack can be used.",
  ].join("\n");
}

/** These algorithms never update the installed-pack inventory. */
export function reconciliationReviewIsAuthority(document: ReconciliationDocument): false {
  void document;
  return false;
}
