import { describe, expect, it } from "vitest";
import {
  compareInvestigationPlans, exportInvestigationPlan, filterCheckpointInvestigations,
  investigationPlanIsManual, planCheckpointInvestigations,
  summarizeCheckpointInvestigations,
} from "./recoveryCheckpointPlan";
import { emptyCheckpointDocument, type CheckpointDocument, type CheckpointEntry } from "./recoveryCheckpoint";
const source = { name: "Open source", licence: "CC0-1.0", date: "2026-11-19", tier: "UNKNOWN" as const, reference: "a" };
const observation = { bytes: null, digest: null, condition: "UNKNOWN" as const, note: "" };
const entry = (patch: Partial<CheckpointEntry> = {}): CheckpointEntry => ({
  id: "entry-1", packId: "region-1", operation: "download",
  capturedAt: "2026-11-19T12:00:00.000Z", source, observation, phase: "draft", ...patch,
});
const document = (...entries: CheckpointEntry[]): CheckpointDocument => ({ ...emptyCheckpointDocument(), entries });

describe("manual investigation planning", () => {
  it("creates no actions for an empty journal", () => {
    expect(planCheckpointInvestigations(document())).toEqual([]);
  });
  it("keeps unknown conditions blocked", () => {
    expect(planCheckpointInvestigations(document(entry()))[0]?.priority).toBe("blocked");
  });
  it("exposes an unknown condition as a reason", () => {
    expect(planCheckpointInvestigations(document(entry()))[0]?.reasons).toContain("unknown-condition");
  });
  it("preserves missing size as a reason", () => {
    expect(planCheckpointInvestigations(document(entry()))[0]?.reasons).toContain("missing-size");
  });
  it("preserves missing digest as a reason", () => {
    expect(planCheckpointInvestigations(document(entry()))[0]?.reasons).toContain("missing-digest");
  });
  it("preserves single-source limitations", () => {
    expect(planCheckpointInvestigations(document(entry()))[0]?.reasons).toContain("single-source");
  });
  it("does not promote a reported successful download to ready", () => {
    const reported = entry({ observation: { ...observation, condition: "available" } });
    expect(planCheckpointInvestigations(document(reported))[0]?.contentReady).toBe(false);
  });
  it("never invokes a download", () => {
    expect(planCheckpointInvestigations(document(entry()))[0]?.requiresUserDecision).toBe(true);
  });
  it("gives manual network guidance for downloads", () => {
    expect(planCheckpointInvestigations(document(entry()))[0]?.manualSteps).toContain("check-connection");
  });
  it("gives manual storage guidance for downloads", () => {
    expect(planCheckpointInvestigations(document(entry()))[0]?.manualSteps).toContain("check-storage");
  });
  it("gives manual output guidance for exports", () => {
    const exported = entry({ operation: "export" });
    expect(planCheckpointInvestigations(document(exported))[0]?.manualSteps).toContain("review-output");
  });
  it("gives local pack guidance for packs", () => {
    const packed = entry({ operation: "pack" });
    expect(planCheckpointInvestigations(document(packed))[0]?.manualSteps).toContain("read-pack");
  });
  it("marks reported damage blocked", () => {
    const damaged = entry({ observation: { ...observation, condition: "damaged" } });
    expect(planCheckpointInvestigations(document(damaged))[0]?.priority).toBe("blocked");
  });
  it("retains reported damage as a reason", () => {
    const damaged = entry({ observation: { ...observation, condition: "damaged" } });
    expect(planCheckpointInvestigations(document(damaged))[0]?.reasons).toContain("reported-damage");
  });
  it("marks a disputed note blocked", () => {
    const disputed = entry({ phase: "disputed" });
    expect(planCheckpointInvestigations(document(disputed))[0]?.reasons).toContain("disputed-review");
  });
  it("shows interrupted notes as requiring review", () => {
    const interrupted = entry({ observation: { bytes: 50, digest: "a".repeat(64), condition: "interrupted", note: "" } });
    expect(planCheckpointInvestigations(document(interrupted))[0]?.priority).toBe("review");
  });
  it("marks reported missing files for review", () => {
    const missing = entry({ observation: { bytes: 50, digest: "a".repeat(64), condition: "missing", note: "" } });
    expect(planCheckpointInvestigations(document(missing))[0]?.reasons).toContain("reported-missing");
  });
  it("marks reported present files as information only when measurements are supplied", () => {
    const complete = entry({ observation: { bytes: 50, digest: "a".repeat(64), condition: "available", note: "" } });
    expect(planCheckpointInvestigations(document(complete))[0]?.priority).toBe("information");
    expect(planCheckpointInvestigations(document(complete))[0]?.contentReady).toBe(false);
  });
  it("sorts blocked items ahead of review items", () => {
    const blocked = entry({ packId: "z" });
    const review = entry({ id: "entry-2", packId: "a", observation: { bytes: 20, digest: "a".repeat(64), condition: "missing", note: "" } });
    expect(planCheckpointInvestigations(document(review, blocked))[0]?.packId).toBe("z");
  });
  it("counts blocked investigations", () => {
    expect(summarizeCheckpointInvestigations(document(entry())).blocked).toBe(1);
  });
  it("counts UNKNOWN investigations", () => {
    expect(summarizeCheckpointInvestigations(document(entry())).unknown).toBe(1);
  });
  it("counts empty investigations as zero", () => {
    expect(summarizeCheckpointInvestigations(document()).total).toBe(0);
  });
  it("filters by requested pack", () => {
    expect(filterCheckpointInvestigations(document(entry()), { packId: "other" })).toEqual([]);
  });
  it("filters by requested operation", () => {
    expect(filterCheckpointInvestigations(document(entry()), { operation: "pack" })).toEqual([]);
  });
  it("filters by requested reason", () => {
    expect(filterCheckpointInvestigations(document(entry()), { reason: "unknown-condition" })).toHaveLength(1);
  });
  it("filters by priority", () => {
    expect(filterCheckpointInvestigations(document(entry()), { priority: "review" })).toHaveLength(0);
  });
  it("exposes new investigations in a comparison", () => {
    expect(compareInvestigationPlans(document(), document(entry())).newlyListed).toEqual(["region-1/download"]);
  });
  it("exposes removed manual investigations in a comparison", () => {
    expect(compareInvestigationPlans(document(entry()), document()).noLongerListed).toEqual(["region-1/download"]);
  });
  it("exposes unchanged priorities", () => {
    expect(compareInvestigationPlans(document(entry()), document(entry())).unchanged).toEqual(["region-1/download"]);
  });
  it("exposes changes of priority", () => {
    const changed = entry({ observation: { bytes: 50, digest: "a".repeat(64), condition: "missing", note: "" } });
    expect(compareInvestigationPlans(document(entry()), document(changed)).changedPriority).toEqual(["region-1/download"]);
  });
  it("does not emit automatic actions", () => {
    expect(compareInvestigationPlans(document(entry()), document()).automaticActions).toBe(0);
  });
  it("exports each source on every entry", () => {
    const output = JSON.parse(exportInvestigationPlan(document(entry())) ?? "null");
    expect(output.sourceEntries[0].source.name).toBe(source.name);
    expect(output.sourceEntries[0].source.licence).toBe(source.licence);
    expect(output.sourceEntries[0].source.tier).toBe(source.tier);
  });
  it("identifies exports as manual only", () => {
    const output = JSON.parse(exportInvestigationPlan(document(entry())) ?? "null");
    expect(output.automaticActions).toBe(0);
  });
  it("rejects malformed exported input", () => {
    const malformed = { ...document(entry()), entries: [null] } as unknown as CheckpointDocument;
    expect(exportInvestigationPlan(malformed)).toBeNull();
  });
  it("returns true when all investigations require user decision", () => {
    expect(investigationPlanIsManual(document(entry()))).toBe(true);
  });
  it("returns true for an empty plan", () => {
    expect(investigationPlanIsManual(document())).toBe(true);
  });
});
