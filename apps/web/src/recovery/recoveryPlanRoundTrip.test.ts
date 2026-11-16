import { describe, expect, it } from "vitest";
import { planPackRepairs } from "./recoveryPolicy";
import { createRecoveryBatch } from "./recoveryBatch";
import { emptyRecoveryLedger } from "./recoveryLedger";
import { createLocalPlanExport } from "./recoveryPlanExport";
import { inspectRecoveryPlan } from "./recoveryPlanImport";
import { compareRecoveryPlan } from "./recoveryPlanCompare";
import { buildRecoverySteps } from "./recoveryPlanSteps";
import { makePlanDiffExport } from "./recoveryPlanDiffExport";
import type { LocalPackRecord } from "./packInventory";

const day = "2026-11-15";
const source = { name: "Open local records", licence: "CC-BY-4.0", date: "2026-08-08" };
const records: readonly LocalPackRecord[] = [
  { id: "pack-a", state: "corrupt", source },
  { id: "pack-b", state: "unknown" },
  { id: "pack-c", state: "ready", byteLength: 28, source },
];
function initialPlan() {
  const policy = planPackRepairs(records, { date: day });
  const queue = createRecoveryBatch(policy.recommendations);
  const result = createLocalPlanExport(policy, queue, emptyRecoveryLedger());
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected a safe plan");
  const parsed = inspectRecoveryPlan(result.content, { referenceDate: day });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error("Exported recovery plan must be readable");
  return parsed.document;
}

describe("recovery plan end-to-end integration", () => {
  it("round-trips a locally exported plan with no invented provenance", () => {
    const plan = initialPlan();
    expect(plan.entries).toHaveLength(3);
    expect(plan.entries.find((x) => x.packId === "pack-a")?.localState).toBe("corrupt");
    expect(plan.entries.find((x) => x.packId === "pack-b")?.localState).toBe("unknown");
    expect(plan.entries.find((x) => x.packId === "pack-b")?.source).toBeNull();
    expect(plan.entries.find((x) => x.packId === "pack-c")?.source).toEqual(source);
  });

  it("retains UNKNOWN from prior plan to current inspection", () => {
    const plan = initialPlan();
    const current = planPackRepairs(records, { date: day });
    const result = compareRecoveryPlan(plan, current, { currentInspected: true });
    const packB = result.entries.find((x) => x.id === "pack-b");
    expect(packB?.current).toBe("unknown");
    expect(packB?.result).toBe("unknown");
    const steps = buildRecoverySteps(result);
    expect(steps.steps.find((x) => x.packId === "pack-b" && x.kind === "do-not-use")).toBeTruthy();
  });

  it("does not turn an earlier healthy state into current readiness", () => {
    const plan = initialPlan();
    const current = planPackRepairs([
      { id: "pack-a", state: "unknown" },
      { id: "pack-b", state: "unknown" },
      { id: "pack-c", state: "corrupt", source },
    ], { date: day });
    const result = compareRecoveryPlan(plan, current, { currentInspected: true });
    const packC = result.entries.find((x) => x.id === "pack-c");
    expect(packC?.previous).toBe("ready");
    expect(packC?.current).toBe("corrupt");
    expect(packC?.result).toBe("blocked");
    expect(buildRecoverySteps(result).steps.some((x) => x.packId === "pack-c" && x.kind === "request-copy")).toBe(true);
  });

  it("does not restore an old queue decision during comparison", () => {
    const plan = initialPlan();
    const policy = planPackRepairs(records, { date: day });
    const before = JSON.stringify(policy);
    const result = compareRecoveryPlan(plan, policy, { currentInspected: true });
    expect(JSON.stringify(policy)).toBe(before);
    expect(result.entries.find((x) => x.id === "pack-a")?.queueNote).toBe("pending");
  });

  it("exports comparison differences without carrying hidden data", () => {
    const plan = initialPlan();
    const current = planPackRepairs(records, { date: day });
    const comparison = compareRecoveryPlan(plan, current, { currentInspected: true });
    const result = makePlanDiffExport(comparison);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).not.toContain("https://");
    expect(result.content).not.toContain("latitude");
    expect(result.content).not.toContain("coordinates");
    expect(result.content).toContain('"currentState": "unknown"');
  });

  it("requires fresh observation before exporting a comparison", () => {
    const plan = initialPlan();
    const current = planPackRepairs(records, { date: day });
    const comparison = compareRecoveryPlan(plan, current, { currentInspected: false });
    expect(makePlanDiffExport(comparison)).toEqual({ ok: false, reason: "not-inspected" });
  });

  it("supports a refreshed source date without adopting historical metadata", () => {
    const plan = initialPlan();
    const changed = planPackRepairs([
      { id: "pack-a", state: "corrupt", source },
      { id: "pack-b", state: "unknown" },
      { id: "pack-c", state: "ready", byteLength: 28,
        source: { ...source, date: "2026-09-01" } },
    ], { date: day });
    const comparison = compareRecoveryPlan(plan, changed, { currentInspected: true });
    const entry = comparison.entries.find((x) => x.id === "pack-c");
    expect(entry?.changes).toContain("date-changed");
    expect(entry?.currentSource?.date).toBe("2026-09-01");
    const output = makePlanDiffExport(comparison);
    expect(output.ok).toBe(true);
    if (output.ok) expect(output.content).toContain("2026-09-01");
  });
});
