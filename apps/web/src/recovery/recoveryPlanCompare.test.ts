import { describe, expect, it } from "vitest";
import {
  compareRecoveryPlan, filterPlanDeltas, planComparisonCopy, summarizePlanChanges,
  type PlanComparison,
} from "./recoveryPlanCompare";
import type { LocalPlanDocument } from "./recoveryPlanExport";
import type { RepairPolicyResult, RepairRecommendation } from "./recoveryPolicy";

const source = { name: "Open public records", licence: "CC-BY-4.0", date: "2026-01-12" };
const history: LocalPlanDocument = {
  format: "local-recovery-plan-v1", inspectionDate: "2026-01-20", outcome: "needs-action",
  entries: [
    { packId: "alfa", localState: "corrupt", queueStage: "waiting", source },
    { packId: "bravo", localState: "ready", queueStage: "done", source },
    { packId: "charlie", localState: "unknown", queueStage: "unknown", source: null },
    { packId: "delta", localState: "absent", queueStage: "pending", source: null },
  ],
  session: { actions: 12, omitted: 0 },
};
const now: readonly RepairRecommendation[] = [
  { id: "alfa", state: "ready", priority: "none", kind: "none", flags: [], bytes: 20, contentReady: true, source },
  { id: "bravo", state: "corrupt", priority: "blocked", kind: "redownload", flags: ["damaged"], bytes: 21, contentReady: false, source },
  { id: "charlie", state: "unknown", priority: "blocked", kind: "inspect", flags: ["unknown"], bytes: null, contentReady: false },
  { id: "echo", state: "absent", priority: "blocked", kind: "redownload", flags: ["absent"], bytes: null, contentReady: false },
];
function policy(records: readonly RepairRecommendation[] = now, overflow = 0): RepairPolicyResult {
  return { recommendations: records, findings: [], totals: {
    blocked: records.filter((x) => x.priority === "blocked").length,
    review: records.filter((x) => x.priority === "review").length,
    none: records.filter((x) => x.priority === "none").length,
  }, overflow, date: "2026-11-15" };
}
function comparison(records: readonly RepairRecommendation[] = now): PlanComparison {
  return compareRecoveryPlan(history, policy(records), { currentInspected: true });
}

describe("saved plan to current inspection comparison", () => {
  it("never treats an imported done stage as fresh readiness", () => {
    const result = comparison();
    const bravo = result.entries.find((x) => x.id === "bravo");
    expect(bravo?.queueNote).toBe("done");
    expect(bravo?.previous).toBe("ready");
    expect(bravo?.current).toBe("corrupt");
    expect(bravo?.result).toBe("blocked");
    expect(bravo?.changes).toContain("state-changed");
  });

  it("does not inherit a ready file from past records", () => {
    const result = comparison();
    const delta = result.entries.find((x) => x.id === "delta");
    expect(delta?.current).toBeNull();
    expect(delta?.result).toBe("unknown");
    expect(delta?.changes).toContain("missing-now");
    expect(delta?.changes).toContain("historical-only");
  });

  it("treats new missing files as blocked", () => {
    const result = comparison();
    const echo = result.entries.find((x) => x.id === "echo");
    expect(echo?.previous).toBeNull();
    expect(echo?.current).toBe("absent");
    expect(echo?.result).toBe("blocked");
    expect(echo?.changes).toContain("new-now");
  });

  it("keeps currently unknown files unknown", () => {
    const result = comparison();
    const charlie = result.entries.find((x) => x.id === "charlie");
    expect(charlie?.result).toBe("unknown");
    expect(charlie?.changes).toContain("unknown-now");
  });

  it("distinguishes current ready content from old damaged state", () => {
    const result = comparison();
    const alfa = result.entries.find((x) => x.id === "alfa");
    expect(alfa?.current).toBe("ready");
    expect(alfa?.previous).toBe("corrupt");
    expect(alfa?.result).toBe("review");
  });

  it("does not compare without a current inspection", () => {
    const result = compareRecoveryPlan(history, policy(), { currentInspected: false });
    expect(result.usable).toBe(false);
    expect(result.inspectedDate).toBeNull();
    expect(result.counts.unknown).toBe(result.entries.length);
    for (const item of result.entries) {
      expect(item.current).toBeNull();
      expect(item.result).toBe("unknown");
      expect(item.changes).toContain("requires-recheck");
    }
  });

  it("does not silently discard overflow", () => {
    const result = compareRecoveryPlan(history, policy(now, 2), { currentInspected: true });
    expect(result.partial).toBe(true);
    expect(result.usable).toBe(false);
  });

  it("caps comparisons and signals partial results", () => {
    const result = compareRecoveryPlan(history, policy(), { currentInspected: true, maximum: 2 });
    expect(result.entries).toHaveLength(2);
    expect(result.partial).toBe(true);
    expect(result.entries.map((x) => x.id)).toEqual(["alfa", "bravo"]);
  });

  it("cannot elevate an uninspected entry using a permissive limit", () => {
    const result = compareRecoveryPlan(history, policy(), { currentInspected: false, maximum: 999_999 });
    expect(result.entries.length).toBe(5);
    expect(result.counts.unchanged).toBe(0);
  });

  it("does not mark a source-review finding as fully unchanged", () => {
    const records: RepairRecommendation[] = [
      { id: "bravo", state: "ready", priority: "review", kind: "source",
        flags: ["missing-source"], contentReady: true, bytes: 21 },
    ];
    const result = comparison(records);
    const bravo = result.entries.find((x) => x.id === "bravo");
    expect(bravo?.changes).toContain("source-missing");
    expect(bravo?.result).toBe("review");
  });

  it("reports changes to source licence", () => {
    const changed: RepairRecommendation[] = [
      { id: "alfa", state: "ready", priority: "none", kind: "none", flags: [],
        contentReady: true, bytes: 20, source: { ...source, licence: "CC0 1.0" } },
    ];
    const result = comparison(changed);
    const item = result.entries.find((x) => x.id === "alfa");
    expect(item?.changes).toContain("source-changed");
    expect(item?.result).toBe("review");
  });

  it("reports changed source dates separately", () => {
    const changed: RepairRecommendation[] = [
      { id: "alfa", state: "ready", priority: "none", kind: "none", flags: [],
        contentReady: true, bytes: 20, source: { ...source, date: "2026-01-13" } },
    ];
    const result = comparison(changed);
    const item = result.entries.find((x) => x.id === "alfa");
    expect(item?.changes).toContain("date-changed");
  });

  it("does not misinterpret incomplete content checks as confirmed completion", () => {
    const changed: RepairRecommendation[] = [
      { id: "alfa", state: "ready", priority: "review", kind: "inspect", flags: [],
        contentReady: false, bytes: null },
    ];
    const result = comparison(changed);
    expect(result.entries.find((x) => x.id === "alfa")?.result).toBe("unknown");
  });

  it("sorts entries deterministically", () => {
    const first = comparison();
    const second = comparison([...now].reverse());
    expect(first.entries.map((entry) => entry.id)).toEqual(second.entries.map((entry) => entry.id));
  });

  it("supports all result filters without changing the underlying summary", () => {
    const result = comparison();
    expect(filterPlanDeltas(result, "all")).toHaveLength(result.entries.length);
    for (const filter of ["blocked", "review", "unknown", "unchanged"] as const) {
      expect(filterPlanDeltas(result, filter).every((x) => x.result === filter)).toBe(true);
      expect(filterPlanDeltas(result, filter)).toHaveLength(result.counts[filter]);
    }
    expect(result.entries).toHaveLength(5);
  });

  it("summarizes historical differences with missing files kept separate", () => {
    const summary = summarizePlanChanges(comparison());
    expect(summary.changed).toBe(2);
    expect(summary.newPacks).toBe(1);
    expect(summary.missingPacks).toBe(1);
    expect(summary.unknown).toBe(2);
  });

  it("handles a completely empty historical document", () => {
    const result = compareRecoveryPlan({ ...history, entries: [] }, policy(), { currentInspected: true });
    expect(result.entries).toHaveLength(now.length);
    expect(result.entries.every((x) => x.changes.includes("new-now"))).toBe(true);
  });

  it("handles a completely empty current inventory without assuming success", () => {
    const result = compareRecoveryPlan(history, policy([]), { currentInspected: true });
    expect(result.entries).toHaveLength(history.entries.length);
    expect(result.counts.unknown).toBe(history.entries.length);
  });

  it("has complete English and French copy for every change and result", () => {
    const en = planComparisonCopy("en");
    const fr = planComparisonCopy("fr");
    for (const key of Object.keys(en.changes) as Array<keyof typeof en.changes>) {
      expect(en.changes[key]).toBeTruthy();
      expect(fr.changes[key]).toBeTruthy();
    }
    for (const key of Object.keys(en.status) as Array<keyof typeof en.status>) {
      expect(fr.status[key]).toBeTruthy();
    }
    expect(fr.intro).toContain("’");
    expect(en.unknown).toBe("UNKNOWN");
    expect(fr.unknown).toBe("INCONNU");
  });
});
