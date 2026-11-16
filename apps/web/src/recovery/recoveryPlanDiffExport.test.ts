import { describe, expect, it, vi } from "vitest";
import { makePlanDiffExport, planDiffCopy, savePlanDiff } from "./recoveryPlanDiffExport";
import type { PlanComparison, PlanDelta } from "./recoveryPlanCompare";

const source = { name: "Public community records", licence: "CC BY 4.0", date: "2025-12-01" };
function entry(id: string, state: PlanDelta["current"] = "ready"): PlanDelta {
  return { id, previous: "unknown", current: state, queueNote: "waiting",
    changes: ["state-changed"], source: null, currentSource: source,
    result: state === "unknown" ? "unknown" : state === "ready" ? "review" : "blocked" };
}
function comparison(entries: readonly PlanDelta[] = [entry("ontario")]): PlanComparison {
  return { entries, counts: { blocked: 0, review: 1, unknown: 0, unchanged: 0 },
    inspectedDate: "2026-11-15", planDate: "2026-10-01", partial: false, usable: true };
}

describe("local comparison file export", () => {
  it("creates a JSON document with explicit source, licence and date", () => {
    const result = makePlanDiffExport(comparison());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = JSON.parse(result.content) as Record<string, unknown>;
    expect(doc.format).toBe("local-recovery-diff-v1");
    expect(doc.currentInspection).toBe("2026-11-15");
    expect(doc.earlierInspection).toBe("2026-10-01");
    expect(result.content).toContain("CC BY 4.0");
    expect(result.content).toContain("2025-12-01");
    expect(result.filename).toBe("pack-recovery-differences-2026-11-15.json");
  });

  it("never declares a file with no current observation complete", () => {
    const result = makePlanDiffExport(comparison([entry("past-only", null)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = JSON.parse(result.content) as { completeness: string; entries: Array<{ review: string }> };
    expect(doc.entries[0]?.review).toBe("unknown");
    expect(doc.completeness).toBe("unknown");
  });

  it("treats an UNKNOWN current file state as UNKNOWN in its output", () => {
    const result = makePlanDiffExport(comparison([entry("undecided", "unknown")]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('"currentState": "unknown"');
    expect(result.content).toContain('"review": "unknown"');
  });

  it("does not save a report without fresh inspection", () => {
    const result = makePlanDiffExport({ ...comparison(), usable: false });
    expect(result).toEqual({ ok: false, reason: "not-inspected" });
  });

  it("requires a stated inspection date", () => {
    const result = makePlanDiffExport({ ...comparison(), inspectedDate: null });
    expect(result).toEqual({ ok: false, reason: "not-inspected" });
  });

  it("rejects an impossible inspection date", () => {
    const result = makePlanDiffExport({ ...comparison(), inspectedDate: "2026-02-30" });
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects dates where an earlier plan is in the future", () => {
    const result = makePlanDiffExport({ ...comparison(), planDate: "2027-01-01" });
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects duplicate pack identifiers", () => {
    const result = makePlanDiffExport(comparison([entry("same"), entry("same")]));
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects invalid pack identifiers", () => {
    const result = makePlanDiffExport(comparison([entry("../../sensitive")]));
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects source metadata without a listed open licence", () => {
    const result = makePlanDiffExport(comparison([{ ...entry("id"),
      currentSource: { ...source, licence: "proprietary" } }]));
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects sources with future dates", () => {
    const result = makePlanDiffExport(comparison([{ ...entry("id"),
      currentSource: { ...source, date: "2027-01-01" } }]));
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects markup or control characters in source names", () => {
    const result = makePlanDiffExport(comparison([{ ...entry("id"),
      currentSource: { ...source, name: "<script>" } }]));
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("keeps unknown source metadata explicitly null", () => {
    const result = makePlanDiffExport(comparison([{ ...entry("id"), currentSource: null }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('"currentSource": null');
  });

  it("rejects unsupported change codes", () => {
    const result = makePlanDiffExport(comparison([{ ...entry("id"),
      changes: ["made-safe" as PlanDelta["changes"][number]] }]));
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("sorts entries regardless of initial order", () => {
    const result = makePlanDiffExport(comparison([entry("z"), entry("a")]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = JSON.parse(result.content) as { entries: Array<{ packId: string }> };
    expect(doc.entries.map((x) => x.packId)).toEqual(["a", "z"]);
  });

  it("does not create a false complete outcome when comparison is truncated", () => {
    const result = makePlanDiffExport({ ...comparison(), partial: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = JSON.parse(result.content) as { completeness: string };
    expect(doc.completeness).toBe("partial");
  });

  it("limits output to a bounded number of entries", () => {
    const entries = Array.from({ length: 501 }, (_, i) => entry(`pack-${i}`));
    const result = makePlanDiffExport(comparison(entries));
    expect(result).toEqual({ ok: false, reason: "unsafe" });
  });

  it("invokes the host save callback exactly once after explicit request", async () => {
    const callback = vi.fn(async (_name: string, _content: string) => undefined);
    const result = await savePlanDiff(comparison(), callback);
    expect(result.ok).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not call the host save on unsafe data", async () => {
    const callback = vi.fn(async (_name: string, _content: string) => undefined);
    const result = await savePlanDiff(comparison([entry("../bad")]), callback);
    expect(result.ok).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });

  it("returns a safe save failure without exposing thrown exception text", async () => {
    const result = await savePlanDiff(comparison(), async () => {
      throw new Error("private location or token");
    });
    expect(result).toEqual({ ok: false, reason: "save-failed" });
    expect(JSON.stringify(result)).not.toContain("private location");
  });

  it("exposes useful EN/FR copy without overclaiming", () => {
    const en = planDiffCopy("en");
    const fr = planDiffCopy("fr");
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(en[key]).toBeTruthy();
      expect(fr[key]).toBeTruthy();
    }
    expect(fr.description).toContain("’");
    expect(en.description).toContain("No pack contents");
  });
});
