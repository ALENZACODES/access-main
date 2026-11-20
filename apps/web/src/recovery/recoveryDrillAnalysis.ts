import {
  DRILL_KINDS, eventsForDrill, stepsForDrill, summarizeDrills,
  type DrillCondition, type DrillDocument, type DrillEvent, type DrillKind,
  type DrillOutcome, type DrillPhase, type DrillProvenance, type DrillRun,
  type DrillStep, type DrillSummary, type DrillTier,
} from "./recoveryDrillRun";

export type DrillFindingCode =
  | "UNKNOWN-condition" | "UNKNOWN-tier" | "unresolved-outcome" | "failed-step"
  | "contradictory-outcomes" | "paused-case" | "missing-steps" | "unreviewed-source"
  | "step-after-close" | "event-before-step" | "recovery-not-confirmed" | "stale-retrieval";
export interface DrillFinding {
  readonly runId: string;
  readonly stepId: string | null;
  readonly code: DrillFindingCode;
  readonly severity: "high" | "medium" | "low";
  readonly description: string;
  readonly contentReady: false;
}
export interface DrillReview {
  readonly runId: string;
  readonly packId: string;
  readonly kind: DrillKind;
  readonly phase: DrillPhase;
  readonly steps: number;
  readonly failed: number;
  readonly unknown: number;
  readonly passed: number;
  readonly firstRecorded: string | null;
  readonly latestRecorded: string | null;
  readonly findings: readonly DrillFinding[];
  readonly contentReady: false;
}
export interface DrillPackRollup {
  readonly packId: string;
  readonly drills: number;
  readonly steps: number;
  readonly unresolved: number;
  readonly failed: number;
  readonly unknown: number;
  readonly conditions: readonly DrillCondition[];
  readonly tiers: readonly DrillTier[];
  readonly contentReady: false;
}
export interface DrillSourceRollup {
  readonly provenance: DrillProvenance;
  readonly key: string;
  readonly runs: readonly string[];
  readonly steps: readonly string[];
  readonly events: number;
}
export interface DrillDailyRollup {
  readonly day: string;
  readonly opened: number;
  readonly steps: number;
  readonly events: number;
  readonly failed: number;
  readonly unknown: number;
}
export interface DrillOperationRollup {
  readonly kind: DrillKind;
  readonly runs: number;
  readonly active: number;
  readonly closed: number;
  readonly steps: number;
  readonly failed: number;
}
export interface DrillReport {
  readonly asOf: string;
  readonly summary: DrillSummary;
  readonly reviews: readonly DrillReview[];
  readonly packs: readonly DrillPackRollup[];
  readonly sources: readonly DrillSourceRollup[];
  readonly days: readonly DrillDailyRollup[];
  readonly kinds: readonly DrillOperationRollup[];
  readonly findings: readonly DrillFinding[];
  readonly contentReady: false;
}
export interface DrillComparison {
  readonly packId: string;
  readonly leftRuns: number;
  readonly rightRuns: number;
  readonly addedRunIds: readonly string[];
  readonly removedRunIds: readonly string[];
  readonly changedRunIds: readonly string[];
  readonly addedStepIds: readonly string[];
  readonly removedStepIds: readonly string[];
  readonly changedStepIds: readonly string[];
  readonly contentReady: false;
}
export interface DrillNextAction {
  readonly runId: string;
  readonly packId: string;
  readonly priority: "high" | "medium" | "low";
  readonly reasonCodes: readonly DrillFindingCode[];
  readonly suggestedReview: string;
  readonly contentReady: false;
}
const alpha = (a: string, b: string): number => a.localeCompare(b);
const uniq = <T>(values: readonly T[]): T[] => [...new Set(values)];
const codeSeverity = (code: DrillFindingCode): DrillFinding["severity"] => {
  switch (code) {
    case "failed-step": case "contradictory-outcomes": case "step-after-close": return "high";
    case "UNKNOWN-condition": case "UNKNOWN-tier": case "unresolved-outcome": case "event-before-step": case "recovery-not-confirmed": return "medium";
    default: return "low";
  }
};
const newFinding = (runId: string, stepId: string | null, code: DrillFindingCode, description: string): DrillFinding => ({
  runId, stepId, code, description, severity: codeSeverity(code), contentReady: false,
});
const allSteps = (document: DrillDocument, run: DrillRun): readonly DrillStep[] => stepsForDrill(document, run.id);
const allEvents = (document: DrillDocument, run: DrillRun): readonly DrillEvent[] => eventsForDrill(document, run.id);
const daysApart = (left: string, right: string): number => (Date.parse(right.slice(0, 10) + "T00:00:00Z") - Date.parse(left.slice(0, 10) + "T00:00:00Z")) / 86_400_000;

/** Descriptive review findings only; no eligibility or installed-pack decision. */
export function drillFindings(document: DrillDocument, asOf: string): readonly DrillFinding[] {
  const findings: DrillFinding[] = [];
  for (const run of document.runs) {
    const steps = allSteps(document, run);
    const events = allEvents(document, run);
    if (run.condition === "UNKNOWN") findings.push(newFinding(run.id, null, "UNKNOWN-condition", "Run condition remains UNKNOWN"));
    if (run.provenance.tier === "UNKNOWN") findings.push(newFinding(run.id, null, "UNKNOWN-tier", "Run evidence tier remains UNKNOWN"));
    if (run.provenance.tier === "self-reported") findings.push(newFinding(run.id, null, "unreviewed-source", "Source is self-reported"));
    if (daysApart(run.provenance.retrievedOn, asOf) > 180) findings.push(newFinding(run.id, null, "stale-retrieval", "Source retrieval is older than 180 days"));
    if (run.phase === "paused") findings.push(newFinding(run.id, null, "paused-case", "Rehearsal was paused"));
    if (steps.length === 0) findings.push(newFinding(run.id, null, "missing-steps", "No steps were recorded"));
    if (steps.length > 0 && steps.every((step) => step.outcome !== "pass") && run.phase === "closed") {
      findings.push(newFinding(run.id, null, "recovery-not-confirmed", "Closed review contains no passing observation"));
    }
    const groupedByLabel = new Map<string, Set<DrillOutcome>>();
    for (const step of steps) {
      if (step.condition === "UNKNOWN") findings.push(newFinding(run.id, step.id, "UNKNOWN-condition", "Step condition remains UNKNOWN"));
      if (step.provenance.tier === "UNKNOWN") findings.push(newFinding(run.id, step.id, "UNKNOWN-tier", "Step evidence tier remains UNKNOWN"));
      if (step.outcome === "UNKNOWN" || step.outcome === "not-run") findings.push(newFinding(run.id, step.id, "unresolved-outcome", "Step has no recorded pass/fail observation"));
      if (step.outcome === "fail") findings.push(newFinding(run.id, step.id, "failed-step", "Step recorded a failed observation"));
      if (daysApart(step.provenance.retrievedOn, asOf) > 180) findings.push(newFinding(run.id, step.id, "stale-retrieval", "Step source retrieval is older than 180 days"));
      const label = step.label.trim().toLocaleLowerCase();
      groupedByLabel.set(label, new Set([...(groupedByLabel.get(label) ?? []), step.outcome]));
    }
    for (const [label, outcomes] of groupedByLabel) {
      if (outcomes.has("pass") && outcomes.has("fail")) {
        findings.push(newFinding(run.id, null, "contradictory-outcomes", `Contradictory observations for ${label}`));
      }
    }
    const closed = events.filter((event) => event.kind === "closed").at(-1);
    if (closed && steps.some((step) => step.recordedAt > closed.at) && !events.some((event) => event.kind === "reopened" && event.at >= closed.at)) {
      findings.push(newFinding(run.id, null, "step-after-close", "A step was recorded after the close event"));
    }
    for (const event of events) {
      if (event.kind === "step-recorded") {
        const step = steps.find((item) => item.id === event.stepId);
        if (step && event.at < step.recordedAt) findings.push(newFinding(run.id, step.id, "event-before-step", "Step reference precedes the observation"));
      }
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity] || alpha(a.runId, b.runId) || alpha(a.code, b.code));
}
export function reviewDrill(document: DrillDocument, runId: string, asOf: string): DrillReview | null {
  const run = document.runs.find((item) => item.id === runId);
  if (!run) return null;
  const steps = allSteps(document, run);
  const events = allEvents(document, run);
  const dates = [run.openedAt, ...steps.map((item) => item.recordedAt), ...events.map((item) => item.at)].sort(alpha);
  return {
    runId, packId: run.packId, kind: run.kind, phase: run.phase,
    steps: steps.length,
    failed: steps.filter((step) => step.outcome === "fail").length,
    unknown: steps.filter((step) => step.outcome === "UNKNOWN" || step.outcome === "not-run").length,
    passed: steps.filter((step) => step.outcome === "pass").length,
    firstRecorded: dates[0] ?? null, latestRecorded: dates[dates.length - 1] ?? null,
    findings: drillFindings({ ...document, runs: [run], steps, events }, asOf), contentReady: false,
  };
}
export function drillPackRollups(document: DrillDocument): readonly DrillPackRollup[] {
  return uniq(document.runs.map((item) => item.packId)).sort(alpha).map((packId) => {
    const runs = document.runs.filter((item) => item.packId === packId);
    const ids = new Set(runs.map((item) => item.id));
    const steps = document.steps.filter((item) => ids.has(item.runId));
    return {
      packId, drills: runs.length, steps: steps.length, unresolved: runs.filter((item) => item.phase !== "closed").length,
      failed: steps.filter((item) => item.outcome === "fail").length,
      unknown: steps.filter((item) => item.outcome === "UNKNOWN").length,
      conditions: uniq([...runs.map((item) => item.condition), ...steps.map((item) => item.condition)]).sort(alpha),
      tiers: uniq([...runs.map((item) => item.provenance.tier), ...steps.map((item) => item.provenance.tier)]).sort(alpha),
      contentReady: false,
    };
  });
}
export function drillSourceRollups(document: DrillDocument): readonly DrillSourceRollup[] {
  const map = new Map<string, { provenance: DrillProvenance; runs: string[]; steps: string[]; events: number }>();
  const add = (provenance: DrillProvenance, kind: "runs" | "steps" | "events", id: string): void => {
    const key = JSON.stringify([provenance.source, provenance.licence, provenance.retrievedOn, provenance.tier, provenance.reference]);
    const current = map.get(key) ?? { provenance, runs: [], steps: [], events: 0 };
    if (kind === "events") current.events += 1;
    else current[kind].push(id);
    map.set(key, current);
  };
  for (const run of document.runs) add(run.provenance, "runs", run.id);
  for (const step of document.steps) add(step.provenance, "steps", step.id);
  for (const event of document.events) add(event.provenance, "events", event.id);
  return [...map.entries()].map(([key, item]) => ({ key, provenance: item.provenance, runs: item.runs.sort(alpha), steps: item.steps.sort(alpha), events: item.events })).sort((a, b) => alpha(a.key, b.key));
}
export function drillDailyRollups(document: DrillDocument): readonly DrillDailyRollup[] {
  const days = uniq([
    ...document.runs.map((item) => item.openedAt.slice(0, 10)),
    ...document.steps.map((item) => item.recordedAt.slice(0, 10)),
    ...document.events.map((item) => item.at.slice(0, 10)),
  ]).sort(alpha);
  return days.map((day) => {
    const steps = document.steps.filter((item) => item.recordedAt.startsWith(day));
    return {
      day, opened: document.runs.filter((item) => item.openedAt.startsWith(day)).length,
      steps: steps.length, events: document.events.filter((item) => item.at.startsWith(day)).length,
      failed: steps.filter((item) => item.outcome === "fail").length,
      unknown: steps.filter((item) => item.outcome === "UNKNOWN").length,
    };
  });
}
export function drillOperationRollups(document: DrillDocument): readonly DrillOperationRollup[] {
  return DRILL_KINDS.map((kind) => {
    const runs = document.runs.filter((item) => item.kind === kind);
    const ids = new Set(runs.map((item) => item.id));
    const steps = document.steps.filter((item) => ids.has(item.runId));
    return {
      kind, runs: runs.length, active: runs.filter((item) => item.phase === "in-progress").length,
      closed: runs.filter((item) => item.phase === "closed").length,
      steps: steps.length, failed: steps.filter((item) => item.outcome === "fail").length,
    };
  });
}
export function drillSuggestedReviews(document: DrillDocument, asOf: string): readonly DrillNextAction[] {
  const all = drillFindings(document, asOf);
  return document.runs.map((run): DrillNextAction | null => {
    const findings = all.filter((finding) => finding.runId === run.id);
    if (!findings.length) return null;
    const codes = uniq(findings.map((finding) => finding.code)).sort(alpha);
    const priority = findings.some((item) => item.severity === "high") ? "high" : findings.some((item) => item.severity === "medium") ? "medium" : "low";
    return {
      runId: run.id, packId: run.packId, priority, reasonCodes: codes,
      suggestedReview: priority === "high" ? "Inspect contradictory or failed observations manually" :
        priority === "medium" ? "Review unknown observations and evidence provenance" : "Review the local rehearsal history",
      contentReady: false,
    } satisfies DrillNextAction;
  }).filter((action): action is DrillNextAction => action !== null).sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.priority] - rank[b.priority] || alpha(a.packId, b.packId);
  });
}
export function createDrillReport(document: DrillDocument, asOf: string): DrillReport {
  return {
    asOf, summary: summarizeDrills(document),
    reviews: document.runs.map((run) => reviewDrill(document, run.id, asOf)).filter((review): review is DrillReview => review !== null),
    packs: drillPackRollups(document), sources: drillSourceRollups(document), days: drillDailyRollups(document),
    kinds: drillOperationRollups(document), findings: drillFindings(document, asOf), contentReady: false,
  };
}
function compareRows<T extends { readonly id: string }>(left: readonly T[], right: readonly T[]): [string[], string[], string[]] {
  const a = new Map(left.map((item) => [item.id, JSON.stringify(item)]));
  const b = new Map(right.map((item) => [item.id, JSON.stringify(item)]));
  return [
    right.filter((item) => !a.has(item.id)).map((item) => item.id).sort(alpha),
    left.filter((item) => !b.has(item.id)).map((item) => item.id).sort(alpha),
    right.filter((item) => a.has(item.id) && a.get(item.id) !== b.get(item.id)).map((item) => item.id).sort(alpha),
  ];
}
export function compareDrillPacks(left: DrillDocument, right: DrillDocument, packId: string): DrillComparison {
  const leftRuns = left.runs.filter((item) => item.packId === packId);
  const rightRuns = right.runs.filter((item) => item.packId === packId);
  const lIds = new Set(leftRuns.map((item) => item.id));
  const rIds = new Set(rightRuns.map((item) => item.id));
  const [addedRunIds, removedRunIds, changedRunIds] = compareRows(leftRuns, rightRuns);
  const [addedStepIds, removedStepIds, changedStepIds] = compareRows(
    left.steps.filter((item) => lIds.has(item.runId)), right.steps.filter((item) => rIds.has(item.runId)),
  );
  return {
    packId, leftRuns: leftRuns.length, rightRuns: rightRuns.length,
    addedRunIds, removedRunIds, changedRunIds, addedStepIds, removedStepIds, changedStepIds, contentReady: false,
  };
}
export function drillNarrative(document: DrillDocument, asOf: string, locale: "en" | "fr"): string {
  const report = createDrillReport(document, asOf);
  if (locale === "fr") return [
    `Répétition de récupération — ${asOf}`,
    `Dossiers\u00a0: ${report.summary.runs}`,
    `Étapes\u00a0: ${report.summary.steps}`,
    `Échecs observés\u00a0: ${report.summary.failed}`,
    `Résultats UNKNOWN\u00a0: ${report.summary.unknown}`,
    `Constats de suivi\u00a0: ${report.findings.length}`,
    "Un compte rendu de répétition ne confirme pas qu’un ensemble peut être utilisé.",
  ].join("\n");
  return [
    `Recovery rehearsal — ${asOf}`,
    `Runs: ${report.summary.runs}`,
    `Steps: ${report.summary.steps}`,
    `Observed failures: ${report.summary.failed}`,
    `UNKNOWN outcomes: ${report.summary.unknown}`,
    `Review findings: ${report.findings.length}`,
    "A rehearsal record does not confirm that a pack is usable.",
  ].join("\n");
}
