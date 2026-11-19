import {
  traceBytes, validateTraceDocument,
  type TraceCase, type TraceDocument, type TraceMoment, type TraceResult,
} from "./recoverySessionTrace";

/** A report of notes, never a claim that a transfer succeeded. */
export type TraceFinding =
  | "no-moments" | "unknown-expected-size" | "unknown-observed-size"
  | "observed-over-expected" | "reported-complete-without-evidence"
  | "stopped-without-stop-note" | "time-gap" | "changing-size"
  | "missing-start" | "no-source-reference" | "no-review"
  | "reported-progress" | "uncertain";
export type TraceAssessmentStatus = "UNKNOWN" | "attention" | "documented";
export type TraceNextStep = "check-source" | "inspect-local" | "review-history" | "consider-manual-retry" | "none";
export interface TraceFindingItem {
  readonly code: TraceFinding;
  readonly traceId: string;
  readonly momentId: string | null;
  readonly detail: number | null;
}
export interface TraceAssessment {
  readonly traceId: string;
  readonly status: TraceAssessmentStatus;
  readonly nextStep: TraceNextStep;
  readonly findings: readonly TraceFindingItem[];
  readonly largestObservedBytes: number | "UNKNOWN";
  readonly lastObservedAt: string | null;
  readonly recordedMoments: number;
  readonly isPackReady: false;
}
export interface TraceSequencePoint {
  readonly id: string;
  readonly at: string;
  readonly stage: TraceMoment["stage"];
  readonly bytes: number | "UNKNOWN";
  readonly delta: number | "UNKNOWN";
  readonly elapsedMs: number;
}
export interface TracePackOverview {
  readonly packId: string;
  readonly total: number;
  readonly unknown: number;
  readonly attention: number;
  readonly documented: number;
  readonly latestTimestamp: string | null;
  readonly totalKnownBytes: number;
  readonly missingByteCounts: number;
  readonly sourceNames: readonly string[];
  readonly licences: readonly string[];
  readonly sourceDates: readonly string[];
  readonly tiers: readonly string[];
  readonly readiness: "UNKNOWN";
}
export interface TraceComparison {
  readonly traceId: string;
  readonly change: "added" | "same" | "changed" | "missing";
  readonly previous: TraceAssessmentStatus | null;
  readonly current: TraceAssessmentStatus | null;
  readonly sourceChanged: boolean;
  readonly momentsAdded: number;
}
export interface TraceReport {
  readonly items: readonly TraceAssessment[];
  readonly packs: readonly TracePackOverview[];
  readonly findings: readonly TraceFindingItem[];
  readonly total: number;
  readonly requiresAttention: number;
  readonly unknown: number;
  readonly readyCount: 0;
}
export const MAX_GAP_MS = 2 * 60 * 60 * 1000;

function item(trace: TraceCase, code: TraceFinding, momentId: string | null = null, detail: number | null = null): TraceFindingItem {
  return { traceId: trace.id, code, momentId, detail };
}
function maximumBytes(trace: TraceCase): number | "UNKNOWN" {
  const known = trace.moments.map((m) => m.observedBytes).filter((n): n is number => typeof n === "number");
  return known.length ? Math.max(...known) : "UNKNOWN";
}
function finalTime(trace: TraceCase): string | null {
  return trace.moments[trace.moments.length - 1]?.at ?? null;
}
/** One timeline point per user-entered moment, without interpreting missing bytes. */
export function traceSequence(trace: TraceCase): readonly TraceSequencePoint[] {
  let previous: number | "UNKNOWN" = "UNKNOWN";
  let previousTime = Date.parse(trace.openedAt);
  return trace.moments.map((moment) => {
    const now = Date.parse(moment.at);
    const delta = typeof previous === "number" && typeof moment.observedBytes === "number"
      ? moment.observedBytes - previous : "UNKNOWN";
    const result: TraceSequencePoint = {
      id: moment.id, at: moment.at, stage: moment.stage, bytes: moment.observedBytes,
      delta, elapsedMs: Math.max(0, now - previousTime),
    };
    previous = moment.observedBytes;
    previousTime = now;
    return result;
  });
}
export function assessTrace(trace: TraceCase): TraceAssessment {
  const findings: TraceFindingItem[] = [];
  if (trace.moments.length === 0) findings.push(item(trace, "no-moments"));
  if (trace.expectedBytes === "UNKNOWN") findings.push(item(trace, "unknown-expected-size"));
  if (trace.source.reference === "") findings.push(item(trace, "no-source-reference"));
  if (trace.moments.length && trace.moments[0]?.stage !== "started") findings.push(item(trace, "missing-start"));
  if (trace.moments.every((m) => m.stage !== "reviewed")) findings.push(item(trace, "no-review"));
  if (trace.outcome === "stopped" && trace.moments.every((m) => m.stage !== "stopped")) {
    findings.push(item(trace, "stopped-without-stop-note"));
  }
  if (trace.outcome === "reported-complete" && !trace.moments.some((m) => m.stage === "reviewed")) {
    findings.push(item(trace, "reported-complete-without-evidence"));
  }
  if (trace.outcome === "in-progress") findings.push(item(trace, "reported-progress"));
  let prevTime = Date.parse(trace.openedAt);
  let prevBytes: number | "UNKNOWN" = "UNKNOWN";
  for (const moment of trace.moments) {
    const timestamp = Date.parse(moment.at);
    if (timestamp - prevTime > MAX_GAP_MS) {
      findings.push(item(trace, "time-gap", moment.id, timestamp - prevTime));
    }
    if (moment.observedBytes === "UNKNOWN") findings.push(item(trace, "unknown-observed-size", moment.id));
    if (typeof moment.observedBytes === "number" && typeof trace.expectedBytes === "number" && moment.observedBytes > trace.expectedBytes) {
      findings.push(item(trace, "observed-over-expected", moment.id, moment.observedBytes - trace.expectedBytes));
    }
    if (typeof moment.observedBytes === "number" && typeof prevBytes === "number" && moment.observedBytes < prevBytes) {
      findings.push(item(trace, "changing-size", moment.id, prevBytes - moment.observedBytes));
    }
    prevTime = timestamp;
    prevBytes = moment.observedBytes;
  }
  const severe = findings.some((finding) => [
    "observed-over-expected", "changing-size", "reported-complete-without-evidence", "stopped-without-stop-note",
  ].includes(finding.code));
  const uncertain = findings.some((finding) => [
    "no-moments", "unknown-expected-size", "unknown-observed-size", "no-source-reference", "no-review", "missing-start",
  ].includes(finding.code));
  const status: TraceAssessmentStatus = severe ? "attention" : uncertain || trace.outcome === "UNKNOWN" ? "UNKNOWN" : "documented";
  let nextStep: TraceNextStep = "none";
  if (findings.some((finding) => finding.code === "no-source-reference")) nextStep = "check-source";
  else if (severe) nextStep = "review-history";
  else if (findings.some((finding) => finding.code === "unknown-expected-size" || finding.code === "unknown-observed-size")) nextStep = "inspect-local";
  else if (trace.outcome === "stopped") nextStep = "consider-manual-retry";
  else if (uncertain) nextStep = "review-history";
  return {
    traceId: trace.id, status, nextStep, findings, largestObservedBytes: maximumBytes(trace),
    lastObservedAt: finalTime(trace), recordedMoments: trace.moments.length, isPackReady: false,
  };
}
/** A listed outcome is documentation only; this never reads the pack store. */
export function assessTraceDocument(document: TraceDocument): TraceResult<TraceReport> {
  const checked = validateTraceDocument(document);
  if (!checked.ok) return checked;
  const items = checked.value.traces.map(assessTrace);
  const findings = items.flatMap((assessment) => assessment.findings);
  const packs = summarizeTracePacks(checked.value);
  return { ok: true, value: {
    items, packs, findings, total: items.length,
    requiresAttention: items.filter((assessment) => assessment.status === "attention").length,
    unknown: items.filter((assessment) => assessment.status === "UNKNOWN").length,
    readyCount: 0,
  } };
}
export function summarizeTracePacks(document: TraceDocument): TracePackOverview[] {
  const groups = new Map<string, TraceCase[]>();
  for (const trace of document.traces) groups.set(trace.packId, [...(groups.get(trace.packId) ?? []), trace]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "en")).map(([packId, traces]) => {
    const assessments = traces.map(assessTrace);
    const dates = traces.flatMap((trace) => [trace.openedAt, ...trace.moments.map((moment) => moment.at)]).sort();
    const known = traces.flatMap((trace) => trace.moments.map((moment) => moment.observedBytes)).filter((n): n is number => traceBytes(n) && typeof n === "number");
    const distinct = (values: string[]) => [...new Set(values)].sort();
    return {
      packId, total: traces.length,
      unknown: assessments.filter((one) => one.status === "UNKNOWN").length,
      attention: assessments.filter((one) => one.status === "attention").length,
      documented: assessments.filter((one) => one.status === "documented").length,
      latestTimestamp: dates[dates.length - 1] ?? null,
      totalKnownBytes: known.reduce((sum, n) => sum + n, 0),
      missingByteCounts: traces.filter((trace) => trace.expectedBytes === "UNKNOWN").length + traces.flatMap((t) => t.moments).filter((m) => m.observedBytes === "UNKNOWN").length,
      sourceNames: distinct(traces.map((trace) => trace.source.name)),
      licences: distinct(traces.map((trace) => trace.source.licence)),
      sourceDates: distinct(traces.map((trace) => trace.source.date)),
      tiers: distinct(traces.map((trace) => trace.source.tier)), readiness: "UNKNOWN",
    };
  });
}
/** History comparison does not infer why differences happened. */
export function compareTraceDocuments(before: TraceDocument, after: TraceDocument): TraceResult<TraceComparison[]> {
  const a = validateTraceDocument(before);
  if (!a.ok) return a;
  const b = validateTraceDocument(after);
  if (!b.ok) return b;
  const left = new Map(a.value.traces.map((trace) => [trace.id, trace]));
  const right = new Map(b.value.traces.map((trace) => [trace.id, trace]));
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  return { ok: true, value: ids.map((id) => {
    const previous = left.get(id);
    const current = right.get(id);
    const change = previous === undefined ? "added" : current === undefined ? "missing" :
      JSON.stringify(previous) === JSON.stringify(current) ? "same" : "changed";
    return {
      traceId: id, change,
      previous: previous ? assessTrace(previous).status : null,
      current: current ? assessTrace(current).status : null,
      sourceChanged: Boolean(previous && current && JSON.stringify(previous.source) !== JSON.stringify(current.source)),
      momentsAdded: current ? current.moments.length - (previous?.moments.length ?? 0) : 0,
    };
  }) };
}
export function findingsForTrace(report: TraceReport, traceId: string): readonly TraceFindingItem[] {
  return report.findings.filter((finding) => finding.traceId === traceId);
}
export function findingsByCode(report: TraceReport, code: TraceFinding): readonly TraceFindingItem[] {
  return report.findings.filter((finding) => finding.code === code);
}
export function traceRecommendations(report: TraceReport): readonly { traceId: string; step: TraceNextStep; status: TraceAssessmentStatus }[] {
  return report.items.filter((item) => item.nextStep !== "none").map(({ traceId, nextStep, status }) => ({ traceId, step: nextStep, status }));
}
