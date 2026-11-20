import {
  issueCodes, known, localRoute, provenanceContinuity, traceFindings,
  type Evidence, type Finding, type Interaction, type Locale, type Snapshot, type Trace,
} from "./p20ai-trace-model.ts";
import { envelopeFindings, type ResourceEnvelope } from "./p20ai-offline-envelope.ts";
import { announcementFindings, focusJourneyFindings, type Announcement, type FocusJourney } from "./p20ai-locale-input.ts";
/** Replay couples action-state checks with offline resource and keyboard evidence. */
export interface ReplayStep {
  readonly action: Interaction;
  readonly resources?: ResourceEnvelope;
  readonly keyboard?: FocusJourney;
  readonly announcements?: readonly Announcement[];
  readonly label: string;
}
export interface ReplayPlan {
  readonly initial: Snapshot;
  readonly steps: readonly ReplayStep[];
  readonly requiredRoutes: readonly string[];
  readonly expectedLocale: Locale;
  readonly requireEvidence: boolean;
  readonly offlineMustHaveCachedShell: boolean;
}
export interface ReplayResult {
  readonly pass: boolean;
  readonly findings: readonly Finding[];
  readonly visitedRoutes: readonly string[];
  readonly actionCount: number;
  readonly offlineStepCount: number;
  readonly finalState: Snapshot;
}
const problem = (code: string, step: number, detail: string): Finding =>
  ({ code, step, detail, severity: "error" });
export function routeCoverage(routes: readonly string[], visited: readonly string[]): Finding[] {
  const result: Finding[] = [];
  const found = new Set(visited);
  for (const [index, route] of routes.entries()) {
    if (!localRoute(route)) result.push(problem("required-route-invalid", index, route));
    else if (!found.has(route)) result.push(problem("required-route-missing", index, route));
  }
  return result;
}
export function replay(plan: ReplayPlan): ReplayResult {
  const trace: Trace = { initial: plan.initial, events: plan.steps.map((step) => step.action) };
  const findings: Finding[] = traceFindings(trace);
  const visited = [plan.initial.route];
  let offlineSteps = 0;
  let last = plan.initial;
  for (const [index, step] of plan.steps.entries()) {
    const number = index + 1;
    const current = step.action.after;
    visited.push(current.route);
    if (!known(step.label)) findings.push(problem("step-label-UNKNOWN", number, step.action.id));
    if (current.locale !== plan.expectedLocale && step.action.kind !== "language")
      findings.push(problem("replay-locale-drift", number, current.locale));
    if (current.connection === "offline") {
      offlineSteps += 1;
      if (plan.offlineMustHaveCachedShell && !step.resources)
        findings.push(problem("offline-envelope-UNKNOWN", number, current.route));
    }
    if (step.resources) {
      findings.push(...envelopeFindings(step.resources).map((issue) => ({ ...issue, step: number })));
      if (step.resources.route !== current.route) findings.push(problem("envelope-route-mismatch", number, current.route));
      if (step.resources.locale !== current.locale) findings.push(problem("envelope-locale-mismatch", number, current.locale));
      if (step.resources.offline !== (current.connection === "offline") && current.connection !== "UNKNOWN")
        findings.push(problem("envelope-connectivity-mismatch", number, current.route));
      if (current.connection === "offline" && plan.offlineMustHaveCachedShell &&
        !step.resources.entries.some((entry) => entry.purpose === "shell" && entry.result === "cache" && entry.cache === "hit"))
        findings.push(problem("offline-shell-not-cached", number, current.route));
    }
    if (step.keyboard) {
      findings.push(...focusJourneyFindings(step.keyboard).map((issue) => ({ ...issue, step: number })));
      if (step.keyboard.locale !== current.locale) findings.push(problem("keyboard-locale-mismatch", number, current.locale));
    }
    if (step.announcements) {
      findings.push(...announcementFindings(step.announcements).map((issue) => ({ ...issue, step: number })));
      if (step.announcements.some((item) => item.locale !== current.locale))
        findings.push(problem("announcement-locale-mismatch", number, current.locale));
    }
    if (plan.requireEvidence && last.evidence.length > 0 &&
      ["language", "back", "forward", "disconnect", "reconnect"].includes(step.action.kind))
      findings.push(...provenanceContinuity(last.evidence, current.evidence, number));
    last = current;
  }
  findings.push(...routeCoverage(plan.requiredRoutes, visited));
  const pass = !findings.some((item) => item.severity === "error");
  return { pass, findings, visitedRoutes: visited, actionCount: plan.steps.length,
    offlineStepCount: offlineSteps, finalState: last };
}
export function compareReplays(before: ReplayResult, after: ReplayResult): Finding[] {
  const issues: Finding[] = [];
  const oldErrors = new Set(before.findings.filter((item) => item.severity === "error").map((item) => item.code));
  for (const item of after.findings) {
    if (item.severity === "error" && !oldErrors.has(item.code))
      issues.push(problem("new-regression", item.step, item.code));
  }
  if (after.actionCount < before.actionCount) issues.push(problem("coverage-actions-lost", 0, String(after.actionCount)));
  if (after.offlineStepCount < before.offlineStepCount)
    issues.push(problem("coverage-offline-lost", 0, String(after.offlineStepCount)));
  for (const route of new Set(before.visitedRoutes)) {
    if (!after.visitedRoutes.includes(route)) issues.push(problem("coverage-route-lost", 0, route));
  }
  return issues;
}
export interface ScenarioCandidate {
  readonly key: string;
  readonly locale: Locale;
  readonly width: 320 | 1280;
  readonly route: string;
  readonly offline: boolean;
}
export function scenarioMatrix(routes: readonly string[]): ScenarioCandidate[] {
  return routes.flatMap((route) => (["en", "fr"] as const).flatMap((locale) =>
    ([320, 1280] as const).flatMap((width) => [false, true].map((offline) => ({
      route, locale, width, offline, key: `${route}|${locale}|${width}|${offline ? "offline" : "online"}`,
    })))));
}
export function scenarioCoverage(expected: readonly ScenarioCandidate[], observed: readonly ScenarioCandidate[]): Finding[] {
  const issues: Finding[] = [];
  const expectedKeys = new Set(expected.map((item) => item.key));
  const seen = new Set<string>();
  for (const [i, item] of observed.entries()) {
    if (seen.has(item.key)) issues.push(problem("scenario-duplicate", i, item.key));
    if (!expectedKeys.has(item.key)) issues.push(problem("scenario-unexpected", i, item.key));
    seen.add(item.key);
  }
  for (const [i, item] of expected.entries()) {
    if (!seen.has(item.key)) issues.push(problem("scenario-missing", i, item.key));
  }
  return issues;
}
export function boundedScenarioSample(cases: readonly ScenarioCandidate[], max: number): ScenarioCandidate[] {
  if (!Number.isInteger(max) || max < 1) throw new RangeError("max must be positive");
  if (cases.length <= max) return [...cases];
  if (max === 1) return [cases[0]!];
  const result: ScenarioCandidate[] = [];
  for (let i = 0; i < max; i++) {
    const choice = cases[Math.round(i * (cases.length - 1) / (max - 1))];
    if (choice && !result.some((item) => item.key === choice.key)) result.push(choice);
  }
  return result;
}
export function replayReport(result: ReplayResult, limit = 30): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const rows = result.findings.map((item) => `${item.step} ${item.severity} ${item.code}: ${item.detail}`);
  const remaining = Math.max(0, rows.length - limit);
  return [`status=${result.pass ? "PASS" : "FAIL"} actions=${result.actionCount} offline=${result.offlineStepCount}`,
    ...rows.slice(0, limit), ...(remaining ? [`${remaining} additional findings`] : [])].join("\n");
}
export function replayFailureCodes(result: ReplayResult): string[] {
  return issueCodes(result.findings.filter((item) => item.severity === "error"));
}
export function evidenceAtEnd(result: ReplayResult): readonly Evidence[] { return result.finalState.evidence; }
