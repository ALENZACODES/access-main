import { describe, expect, it } from "vitest";
import { buildRecoverySteps, filterRecoverySteps, recoveryStepCopy } from "./recoveryPlanSteps";
import type { PlanComparison, PlanDelta } from "./recoveryPlanCompare";

function delta(id: string, result: PlanDelta["result"], current: PlanDelta["current"],
  changes: PlanDelta["changes"] = []): PlanDelta {
  return { id, result, previous: "unknown", current, queueNote: "unknown",
    changes, source: null, currentSource: null };
}
function comparison(entries: readonly PlanDelta[], usable = true, partial = false): PlanComparison {
  const counts = { blocked: 0, review: 0, unchanged: 0, unknown: 0 };
  for (const item of entries) counts[item.result]++;
  return { entries, counts, usable, partial, inspectedDate: usable ? "2026-11-15" : null,
    planDate: "2026-10-01" };
}

describe("manual recovery steps", () => {
  it("does not propose an automatic action", () => {
    const result = buildRecoverySteps(comparison([
      delta("corrupt", "blocked", "corrupt"), delta("missing", "blocked", "absent"),
    ]));
    expect(result.noAutomaticActions).toBe(true);
    expect(result.steps.every((step) => step.affectsFiles === false)).toBe(true);
  });

  it("keeps damaged files out of use pending a fresh copy", () => {
    const result = buildRecoverySteps(comparison([delta("pack-a", "blocked", "corrupt")]));
    const kinds = result.steps.map((step) => step.kind);
    expect(kinds[0]).toBe("do-not-use");
    expect(kinds).toContain("request-copy");
    expect(kinds).toContain("review-source");
    expect(kinds).toContain("compare-again");
  });

  it("does not treat an absent file as usable", () => {
    const result = buildRecoverySteps(comparison([delta("pack-a", "blocked", "absent")]));
    expect(result.steps.some((step) => step.kind === "do-not-use")).toBe(true);
    expect(result.steps.some((step) => step.kind === "request-copy")).toBe(true);
  });

  it("recommends local inspection for UNKNOWN file states", () => {
    const result = buildRecoverySteps(comparison([delta("pack-a", "unknown", "unknown")]));
    expect(result.unknown).toBe(1);
    expect(result.steps.some((step) => step.kind === "inspect-local")).toBe(true);
    expect(result.steps.some((step) => step.kind === "do-not-use")).toBe(true);
    expect(result.steps.some((step) => step.kind === "request-copy")).toBe(false);
  });

  it("keeps historical-only rows UNKNOWN", () => {
    const result = buildRecoverySteps(comparison([
      delta("old-only", "unknown", null, ["historical-only"]),
    ]));
    expect(result.steps[0]?.kind).toBe("do-not-use");
  });

  it("does not ask for downloads on unchanged ready files", () => {
    const result = buildRecoverySteps(comparison([
      delta("stable", "unchanged", "ready", ["same-state"]),
    ]));
    expect(result.steps).toHaveLength(0);
  });

  it("recommends source review for mismatched licences", () => {
    const result = buildRecoverySteps(comparison([
      delta("source", "review", "ready", ["source-changed"]),
    ]));
    expect(result.steps.map((step) => step.kind)).toContain("review-source");
  });

  it("recommends source review for missing provenance", () => {
    const result = buildRecoverySteps(comparison([
      delta("source", "review", "ready", ["source-missing"]),
    ]));
    expect(result.steps.some((step) => step.kind === "review-source")).toBe(true);
  });

  it("recommends source review for changed dates", () => {
    const result = buildRecoverySteps(comparison([
      delta("source", "review", "ready", ["date-changed"]),
    ]));
    expect(result.steps.some((step) => step.kind === "review-source")).toBe(true);
  });

  it("handles changed ready states as review rather than automatic success", () => {
    const result = buildRecoverySteps(comparison([
      delta("changed", "review", "ready", ["state-changed"]),
    ]));
    expect(result.steps.some((step) => step.kind === "compare-again")).toBe(true);
  });

  it("requires fresh local inspection if comparison is not usable", () => {
    const result = buildRecoverySteps(comparison([], false));
    expect(result.incomplete).toBe(true);
    expect(result.steps[0]?.kind).toBe("inspect-local");
    expect(result.steps[0]?.packId).toBeNull();
  });

  it("requires review when a current inspection is partial", () => {
    const result = buildRecoverySteps(comparison([], false, true));
    expect(result.incomplete).toBe(true);
    expect(result.steps.map((x) => x.kind)).toContain("inspect-local");
  });

  it("sorts blocked steps before review-only notes", () => {
    const result = buildRecoverySteps(comparison([
      delta("review", "review", "ready", ["source-changed"]),
      delta("blocked", "blocked", "corrupt"),
    ]));
    expect(result.steps[0]?.packId).toBe("blocked");
  });

  it("sorts same-priority items by identifier", () => {
    const result = buildRecoverySteps(comparison([
      delta("z", "blocked", "corrupt"), delta("a", "blocked", "absent"),
    ]));
    expect(result.steps[0]?.packId).toBe("a");
  });

  it("never supplies connection assumptions for local inspections", () => {
    const result = buildRecoverySteps(comparison([
      delta("unknown", "unknown", "unknown"),
    ]));
    expect(result.steps.filter((x) => x.kind === "inspect-local")
      .every((x) => x.requiresConnection === false)).toBe(true);
  });

  it("requires a connection only for fresh-copy requests", () => {
    const result = buildRecoverySteps(comparison([
      delta("missing", "blocked", "absent"),
    ]));
    expect(result.steps.filter((x) => x.requiresConnection === true)
      .every((x) => x.kind === "request-copy")).toBe(true);
  });

  it("caps the number of steps and reports truncation", () => {
    const result = buildRecoverySteps(comparison([
      delta("a", "blocked", "corrupt"), delta("b", "blocked", "corrupt"),
    ]), { maxSteps: 2 });
    expect(result.steps).toHaveLength(2);
    expect(result.incomplete).toBe(true);
  });

  it("does not allow a massive client-provided step limit", () => {
    const result = buildRecoverySteps(comparison([
      delta("a", "blocked", "corrupt"),
    ]), { maxSteps: 999999999 });
    expect(result.steps.length).toBeLessThanOrEqual(200);
  });

  it("allows optional historical review only if requested", () => {
    const data = comparison([delta("a", "unknown", "unknown")]);
    const defaultPlan = buildRecoverySteps(data);
    const expandedPlan = buildRecoverySteps(data, { includeOptional: true });
    expect(defaultPlan.steps.some((x) => x.kind === "review-history")).toBe(false);
    expect(expandedPlan.steps.some((x) => x.kind === "review-history")).toBe(true);
  });

  it("filters steps without modifying the plan", () => {
    const plan = buildRecoverySteps(comparison([
      delta("a", "blocked", "corrupt"), delta("b", "unknown", "unknown"),
    ]), { includeOptional: true });
    const before = plan.steps.length;
    for (const filter of ["first", "next", "optional"] as const) {
      expect(filterRecoverySteps(plan, filter).every((x) => x.priority === filter)).toBe(true);
    }
    expect(filterRecoverySteps(plan, "all")).toHaveLength(before);
    expect(plan.steps).toHaveLength(before);
  });

  it("deduplicates a shared global inspection instruction", () => {
    const result = buildRecoverySteps(comparison([
      delta("a", "unknown", "unknown"), delta("b", "unknown", "unknown"),
    ], false));
    expect(result.steps.filter((x) => x.id === "inspect-local:all")).toHaveLength(1);
  });

  it("has bilingual instructions for every step kind", () => {
    const en = recoveryStepCopy("en");
    const fr = recoveryStepCopy("fr");
    for (const kind of Object.keys(en.kinds) as Array<keyof typeof en.kinds>) {
      expect(en.kinds[kind].length).toBeGreaterThan(8);
      expect(fr.kinds[kind].length).toBeGreaterThan(8);
    }
    expect(en.incomplete).toContain("UNKNOWN");
    expect(fr.incomplete).toContain("INCONNUS");
  });
});
