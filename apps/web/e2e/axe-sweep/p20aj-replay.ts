import { finding, type CoverageCell, type Evidence, type Finding, type JourneyAction, type Phase, type Snapshot, type Step, type Trace } from "./p20aj-types.ts";
import { coverageFindings, coverageKey, coverageMatrix, safeRoute, snapshotFindings, traceFindings } from "./p20aj-offline.ts";
import { evidenceContinuity } from "./p20aj-evidence.ts";

/** An explicit plan contains preconditions and observations, never inferred browser outcomes. */
export interface Scenario {
  readonly name: string;
  readonly initial: Snapshot;
  readonly actions: readonly PlannedAction[];
}
export interface PlannedAction {
  readonly kind: JourneyAction;
  readonly route: string | null;
  readonly expectedPhase: Phase | null;
  readonly preserveEvidence: boolean;
  readonly preserveFocus: boolean;
}
export interface ReplayFrame {
  readonly action: PlannedAction;
  readonly before: Snapshot;
  readonly after: Snapshot;
  readonly observed: boolean;
}
export interface ReplayResult {
  readonly trace: Trace;
  readonly findings: readonly Finding[];
  readonly incomplete: boolean;
}
export interface CoverageResult {
  readonly expected: readonly CoverageCell[];
  readonly observed: readonly CoverageCell[];
  readonly findings: readonly Finding[];
}
export function scenarioFindings(scenario: Scenario): Finding[] {
  const problems: Finding[] = [];
  if (!scenario.name.trim()) problems.push(finding("scenario-name", "continuity", 0, "Unnamed scenario"));
  if (!safeRoute(scenario.initial.route)) problems.push(finding("scenario-route", "route", 0, scenario.initial.route));
  for (let index = 0; index < scenario.actions.length; index += 1) {
    const action = scenario.actions[index];
    if (!action) continue;
    if (action.kind === "navigate" && (action.route === null || !safeRoute(action.route))) {
      problems.push(finding("scenario-navigation", "route", index + 1, action.route ?? "UNKNOWN"));
    }
    if (action.kind !== "navigate" && action.route !== null && !safeRoute(action.route)) {
      problems.push(finding("scenario-target", "route", index + 1, action.route));
    }
    if (["back", "forward"].includes(action.kind) && action.route === null) {
      problems.push(finding("scenario-history-target-UNKNOWN", "history", index + 1, action.kind, "information"));
    }
  }
  return problems;
}
export function plannedAction(kind: JourneyAction, changes: Partial<PlannedAction> = {}): PlannedAction {
  return { kind, route: null, expectedPhase: null, preserveEvidence: true, preserveFocus: false, ...changes };
}
export function sequenceScenario(initial: Snapshot, actions: readonly PlannedAction[], name = "Offline journey"): Scenario {
  return { name, initial, actions };
}
export function reconcileReplay(scenario: Scenario, frames: readonly ReplayFrame[]): ReplayResult {
  const problems = scenarioFindings(scenario);
  const steps: Step[] = [];
  let previous = scenario.initial;
  let incomplete = false;
  for (let index = 0; index < scenario.actions.length; index += 1) {
    const plan = scenario.actions[index];
    const frame = frames[index];
    if (!plan) continue;
    if (!frame || !frame.observed) {
      incomplete = true;
      problems.push(finding("replay-observation-UNKNOWN", "continuity", index + 1, plan.kind, "information"));
      continue;
    }
    if (frame.action.kind !== plan.kind) problems.push(finding("replay-action-mismatch", "continuity", index + 1, frame.action.kind));
    if (frame.before.route !== previous.route || frame.before.locale !== previous.locale) {
      problems.push(finding("replay-disconnected", "continuity", index + 1, frame.before.route));
    }
    const step: Step = {
      action: plan.kind, before: frame.before, after: frame.after,
      targetRoute: plan.route, preserveEvidence: plan.preserveEvidence,
      preserveFocus: plan.preserveFocus, expectedStatus: plan.expectedPhase,
    };
    steps.push(step);
    previous = frame.after;
  }
  if (frames.length > scenario.actions.length) {
    problems.push(finding("replay-extra-frames", "continuity", frames.length, String(frames.length)));
  }
  const trace: Trace = { name: scenario.name, initial: scenario.initial, steps };
  problems.push(...traceFindings(trace));
  return { trace, findings: problems, incomplete };
}
export function compareReplay(before: ReplayResult, after: ReplayResult): Finding[] {
  const problems: Finding[] = [];
  const identity = (entry: Finding): string => [entry.area, entry.code, entry.step].join("|");
  const oldErrors = new Set(before.findings.filter((item) => item.severity === "error").map(identity));
  const newErrors = new Set(after.findings.filter((item) => item.severity === "error").map(identity));
  for (const key of newErrors) if (!oldErrors.has(key)) problems.push(finding("new-regression", "continuity", 0, key));
  if (!before.incomplete && after.incomplete) problems.push(finding("coverage-regressed", "continuity", 0, after.trace.name));
  if (after.trace.steps.length < before.trace.steps.length) problems.push(finding("steps-lost", "continuity", 0, after.trace.name));
  return problems;
}
export function preserveRecords(before: readonly Evidence[], after: readonly Evidence[], actionIndex: number): Finding[] {
  return evidenceContinuity(before, after, actionIndex, true);
}
export function coverageForRoutes(routes: readonly string[], observations: readonly CoverageCell[]): CoverageResult {
  const expected = coverageMatrix(routes);
  return { expected, observed: observations, findings: coverageFindings(expected, observations) };
}
export function coverageSummary(cells: readonly CoverageCell[]): Record<string, number> {
  const counts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const cell of cells) {
    const key = `${cell.locale}/${cell.connectivity}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
export function missingCells(routes: readonly string[], observed: readonly CoverageCell[]): CoverageCell[] {
  const seen = new Set(observed.map(coverageKey));
  return coverageMatrix(routes).filter((cell) => !seen.has(coverageKey(cell)));
}
export function sampleRouteWindows(routes: readonly string[], maximum: number): string[] {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be a positive integer");
  if (routes.length <= maximum) return [...routes];
  if (maximum === 1) return [routes[0]!];
  const selected: string[] = [];
  for (let index = 0; index < maximum; index += 1) {
    const position = Math.round(index * (routes.length - 1) / (maximum - 1));
    const route = routes[position];
    if (route && !selected.includes(route)) selected.push(route);
  }
  return selected;
}
export function replayDiagnostic(result: ReplayResult, limit = 30): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const summary = result.findings.map((entry) => `${entry.step} ${entry.area}/${entry.code} ${entry.detail}`);
  const omitted = Math.max(0, summary.length - limit);
  return [`Trace: ${result.trace.name}`, `Observed steps: ${result.trace.steps.length}`,
    `Completeness: ${result.incomplete ? "UNKNOWN" : "complete"}`,
    ...summary.slice(0, limit), ...(omitted ? [`${omitted} additional findings`] : [])].join("\n");
}
export function coverageGate(result: CoverageResult): Finding[] {
  const findings = [...result.findings];
  if (!result.expected.length) findings.push(finding("coverage-empty", "route", 0, "No expected routes"));
  const seen = new Set(result.observed.map(coverageKey));
  for (const cell of result.expected) {
    if (cell.connectivity === "offline" && !seen.has(coverageKey(cell))) {
      findings.push(finding("offline-coverage-missing", "route", 0, cell.route));
    }
  }
  return findings;
}
export function timelineFindings(snapshots: readonly Snapshot[]): Finding[] {
  const problems: Finding[] = [];
  let lastTime: number | null = null;
  for (let index = 0; index < snapshots.length; index += 1) {
    const current = snapshots[index];
    if (!current) continue;
    problems.push(...snapshotFindings(current, index));
    if (current.time === null) problems.push(finding("timeline-time-UNKNOWN", "continuity", index, current.route, "information"));
    if (lastTime !== null && current.time !== null && current.time < lastTime) {
      problems.push(finding("timeline-reversed", "continuity", index, current.route));
    }
    lastTime = current.time ?? lastTime;
  }
  return problems;
}
