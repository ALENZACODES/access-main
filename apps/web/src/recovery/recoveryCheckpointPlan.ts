import { validateCheckpointDocument, type CheckpointDocument, type CheckpointOperation } from "./recoveryCheckpoint";
import { checkpointGaps, checkpointGuidance, checkpointTrends, type CheckpointNextStep } from "./recoveryCheckpointAnalysis";

/** The planner constructs suggestions only. The caller must not execute them. */
export type PlanPriority = "blocked" | "review" | "information";
export type PlanReason =
  | "unknown-condition" | "missing-size" | "missing-digest" | "disputed-review"
  | "single-source" | "reported-damage" | "reported-missing" | "reported-interruption";
export interface PlannedInvestigation {
  readonly id: string;
  readonly packId: string;
  readonly operation: CheckpointOperation;
  readonly priority: PlanPriority;
  readonly reasons: readonly PlanReason[];
  readonly manualSteps: readonly CheckpointNextStep[];
  readonly lastRecordedAt: string;
  readonly contentReady: false;
  readonly requiresUserDecision: true;
}
export interface InvestigationSummary {
  readonly total: number;
  readonly blocked: number;
  readonly review: number;
  readonly information: number;
  readonly unknown: number;
}
export interface InvestigationFilter {
  readonly priority?: PlanPriority;
  readonly packId?: string;
  readonly operation?: CheckpointOperation;
  readonly reason?: PlanReason;
}
const PRIORITY_ORDER: Readonly<Record<PlanPriority, number>> = { blocked: 0, review: 1, information: 2 };
function decidePriority(reasons: readonly PlanReason[]): PlanPriority {
  if (reasons.includes("reported-damage") || reasons.includes("unknown-condition") ||
      reasons.includes("disputed-review")) return "blocked";
  if (reasons.includes("reported-missing") || reasons.includes("reported-interruption") ||
      reasons.includes("missing-size") || reasons.includes("missing-digest")) return "review";
  return "information";
}
export function planCheckpointInvestigations(document: CheckpointDocument): PlannedInvestigation[] {
  const checked = validateCheckpointDocument(document);
  if (!checked.ok) return [];
  const trends = checkpointTrends(checked.value);
  const gaps = checkpointGaps(checked.value);
  const steps = checkpointGuidance(checked.value);
  const items: PlannedInvestigation[] = [];
  for (const trend of trends) {
    const gap = gaps.find((item) => item.packId === trend.packId && item.operation === trend.operation);
    const guide = steps.find((item) => item.packId === trend.packId && item.operation === trend.operation);
    const reasons: PlanReason[] = [];
    if (trend.current === "UNKNOWN") reasons.push("unknown-condition");
    if (trend.current === "damaged") reasons.push("reported-damage");
    if (trend.current === "missing") reasons.push("reported-missing");
    if (trend.current === "interrupted") reasons.push("reported-interruption");
    if (gap?.missingBytes) reasons.push("missing-size");
    if (gap?.missingDigest) reasons.push("missing-digest");
    if (gap?.disputed) reasons.push("disputed-review");
    if (gap?.singleSource) reasons.push("single-source");
    items.push({
      id: `${trend.packId}/${trend.operation}`,
      packId: trend.packId,
      operation: trend.operation,
      priority: decidePriority(reasons),
      reasons,
      manualSteps: guide?.actions ?? ["review-source"],
      lastRecordedAt: trend.latestAt,
      contentReady: false,
      requiresUserDecision: true,
    });
  }
  return items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id.localeCompare(b.id));
}
export function summarizeCheckpointInvestigations(document: CheckpointDocument): InvestigationSummary {
  const items = planCheckpointInvestigations(document);
  return {
    total: items.length,
    blocked: items.filter((item) => item.priority === "blocked").length,
    review: items.filter((item) => item.priority === "review").length,
    information: items.filter((item) => item.priority === "information").length,
    unknown: items.filter((item) => item.reasons.includes("unknown-condition")).length,
  };
}
export function filterCheckpointInvestigations(
  document: CheckpointDocument, filter: InvestigationFilter,
): PlannedInvestigation[] {
  return planCheckpointInvestigations(document).filter((item) =>
    (filter.priority === undefined || item.priority === filter.priority) &&
    (filter.packId === undefined || item.packId === filter.packId) &&
    (filter.operation === undefined || item.operation === filter.operation) &&
    (filter.reason === undefined || item.reasons.includes(filter.reason)));
}
export interface InvestigationComparison {
  readonly newlyListed: readonly string[];
  readonly noLongerListed: readonly string[];
  readonly unchanged: readonly string[];
  readonly changedPriority: readonly string[];
  readonly automaticActions: 0;
}
/** Compares two sets of human observations without performing a recovery action. */
export function compareInvestigationPlans(
  previous: CheckpointDocument, current: CheckpointDocument,
): InvestigationComparison {
  const old = new Map(planCheckpointInvestigations(previous).map((item) => [item.id, item]));
  const next = new Map(planCheckpointInvestigations(current).map((item) => [item.id, item]));
  const newlyListed: string[] = [];
  const noLongerListed: string[] = [];
  const unchanged: string[] = [];
  const changedPriority: string[] = [];
  for (const [id, item] of next) {
    const past = old.get(id);
    if (past === undefined) newlyListed.push(id);
    else if (past.priority !== item.priority) changedPriority.push(id);
    else unchanged.push(id);
  }
  for (const id of old.keys()) if (!next.has(id)) noLongerListed.push(id);
  return {
    newlyListed: newlyListed.sort(),
    noLongerListed: noLongerListed.sort(),
    unchanged: unchanged.sort(),
    changedPriority: changedPriority.sort(),
    automaticActions: 0,
  };
}
export function exportInvestigationPlan(document: CheckpointDocument): string | null {
  const checked = validateCheckpointDocument(document);
  if (!checked.ok) return null;
  const output = {
    format: "local-recovery-investigation-plan", version: 1,
    items: planCheckpointInvestigations(checked.value),
    summary: summarizeCheckpointInvestigations(checked.value),
    sourceEntries: checked.value.entries,
    automaticActions: 0,
  };
  const value = `${JSON.stringify(output, null, 2)}\n`;
  return new TextEncoder().encode(value).byteLength <= 384 * 1024 ? value : null;
}
export function investigationPlanIsManual(document: CheckpointDocument): boolean {
  return planCheckpointInvestigations(document).every((item) => item.contentReady === false && item.requiresUserDecision);
}
