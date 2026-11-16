import { describe, expect, it } from "vitest";
import {
  actionEligibleForDownload, actionsCopy, proposeRecoveryActions,
  reconcileRecoveryActions, transitionRecoveryAction,
} from "./recoveryActions";
import { diagnoseInventory } from "./recoveryDiagnostics";
import type { LocalPackRecord } from "./packInventory";
import type { DiagnosticSummary } from "./recoveryDiagnostics";

const source = { name: "Public catalogue", licence: "OGL-ON-1.0", date: "2026-11-01" };
function pack(id: string, state: LocalPackRecord["state"]): LocalPackRecord {
  return { id, source, state, byteLength: 8 };
}
function diagnostics(records: LocalPackRecord[]): DiagnosticSummary {
  return diagnoseInventory(records, { today: "2026-11-15" });
}

describe("action proposal", () => {
  it("creates no tasks from a clear inventory", () => {
    expect(proposeRecoveryActions(diagnostics([pack("east", "ready")])).items).toEqual([]);
  });
  it("proposes download after a damaged pack", () => {
    const plan = proposeRecoveryActions(diagnostics([pack("east", "corrupt")]));
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ packId: "east", kind: "download", priority: "required" });
  });
  it("proposes a manual download for an absent pack", () => {
    const plan = proposeRecoveryActions(diagnostics([pack("east", "absent")]));
    expect(plan.items[0]).toMatchObject({ kind: "download", priority: "suggested" });
  });
  it("does not propose a download automatically for UNKNOWN state", () => {
    const plan = proposeRecoveryActions(diagnostics([pack("east", "unknown")]));
    expect(plan.items[0]?.kind).toBe("inspect");
  });
  it("groups multiple missing source issues into one review action", () => {
    const result = diagnostics([{
      id: "east", state: "ready", byteLength: 8,
      source: { name: "Original", licence: "UNKNOWN", date: "not-a-date" },
    }]);
    const plan = proposeRecoveryActions(result);
    expect(plan.items.filter((item) => item.kind === "review-source")).toHaveLength(1);
  });
  it("prioritises required actions before optional actions", () => {
    const result = diagnostics([
      { id: "east", state: "corrupt", source, byteLength: 8 },
      { id: "west", state: "ready", source, byteLength: undefined },
    ]);
    const plan = proposeRecoveryActions(result);
    expect(plan.items[0]?.priority).toBe("required");
    expect(plan.items[plan.items.length - 1]?.priority).toBe("optional");
  });
  it("limits the number of suggestions from excessive findings", () => {
    const result = diagnostics(Array.from({ length: 600 }, (_, index) => pack(`id-${index}`, "corrupt")));
    const plan = proposeRecoveryActions(result);
    expect(plan.items.length).toBeLessThanOrEqual(300);
  });
  it("never emits an unsafe identifier in an action ID", () => {
    const result = diagnostics([pack("../unsafe", "corrupt")]);
    const plan = proposeRecoveryActions(result);
    expect(JSON.stringify(plan)).not.toContain("../unsafe");
  });
  it("does not assume a download source exists", () => {
    const plan = proposeRecoveryActions(diagnostics([pack("east", "corrupt")]));
    const item = plan.items[0];
    expect(item).toBeDefined();
    if (item) {
      expect(actionEligibleForDownload(item, undefined)).toBe(false);
      expect(actionEligibleForDownload(item, "west")).toBe(false);
      expect(actionEligibleForDownload(item, "east")).toBe(true);
    }
  });
});

describe("manual action transitions", () => {
  const start = () => proposeRecoveryActions(diagnostics([pack("east", "corrupt")]));
  it("refuses automatic transitions", () => {
    const plan = start();
    expect(transitionRecoveryAction(plan, {
      actionId: plan.items[0]?.id ?? "", next: "in-progress", userInitiated: false,
    })).toBe(plan);
  });
  it("refuses action IDs not present in the plan", () => {
    const plan = start();
    expect(transitionRecoveryAction(plan, {
      actionId: "fake", next: "complete", userInitiated: true,
    })).toBe(plan);
  });
  it("requires a started state before allowing completion", () => {
    const plan = start();
    const id = plan.items[0]?.id ?? "";
    expect(transitionRecoveryAction(plan, { actionId: id, next: "complete", userInitiated: true })).toBe(plan);
  });
  it("supports explicit start then completion", () => {
    const plan = start();
    const id = plan.items[0]?.id ?? "";
    const started = transitionRecoveryAction(plan, { actionId: id, next: "in-progress", userInitiated: true });
    const completed = transitionRecoveryAction(started, { actionId: id, next: "complete", userInitiated: true });
    expect(started.items[0]?.status).toBe("in-progress");
    expect(completed.items[0]?.status).toBe("complete");
    expect(completed.blocked).toBe(0);
  });
  it("does not allow a completed step to start without reconsideration", () => {
    const plan = start();
    const id = plan.items[0]?.id ?? "";
    const started = transitionRecoveryAction(plan, { actionId: id, next: "in-progress", userInitiated: true });
    const completed = transitionRecoveryAction(started, { actionId: id, next: "complete", userInitiated: true });
    expect(transitionRecoveryAction(completed, { actionId: id, next: "in-progress", userInitiated: true })).toBe(completed);
  });
  it("permits reconsidering a skipped step", () => {
    const plan = start();
    const id = plan.items[0]?.id ?? "";
    const skipped = transitionRecoveryAction(plan, { actionId: id, next: "skipped", userInitiated: true });
    expect(skipped.items[0]?.status).toBe("skipped");
    const reconsidered = transitionRecoveryAction(skipped, { actionId: id, next: "pending", userInitiated: true });
    expect(reconsidered.items[0]?.status).toBe("pending");
  });
  it("refuses skip during an in-progress operation", () => {
    const plan = start();
    const id = plan.items[0]?.id ?? "";
    const started = transitionRecoveryAction(plan, { actionId: id, next: "in-progress", userInitiated: true });
    expect(transitionRecoveryAction(started, { actionId: id, next: "skipped", userInitiated: true })).toBe(started);
  });
  it("does not mutate the original plan", () => {
    const plan = start();
    const id = plan.items[0]?.id ?? "";
    const next = transitionRecoveryAction(plan, { actionId: id, next: "in-progress", userInitiated: true });
    expect(next).not.toBe(plan);
    expect(plan.items[0]?.status).toBe("pending");
  });
});

describe("reconciliation and eligibility", () => {
  it("reverts completed download status to UNKNOWN for a damaged pack", () => {
    const plan = proposeRecoveryActions(diagnostics([pack("east", "corrupt")]));
    const id = plan.items[0]?.id ?? "";
    const started = transitionRecoveryAction(plan, { actionId: id, next: "in-progress", userInitiated: true });
    const completed = transitionRecoveryAction(started, { actionId: id, next: "complete", userInitiated: true });
    const reconciled = reconcileRecoveryActions(completed, [pack("east", "corrupt")]);
    expect(reconciled.items[0]?.status).toBe("unknown");
    expect(reconciled.unknown).toBe(1);
    expect(reconciled.blocked).toBe(1);
  });
  it("reverts completed status when pack disappears", () => {
    const plan = proposeRecoveryActions(diagnostics([pack("east", "corrupt")]));
    const completed = { ...plan, items: plan.items.map((item) => ({ ...item, status: "complete" as const })) };
    expect(reconcileRecoveryActions(completed, []).items[0]?.status).toBe("unknown");
  });
  it("retains a completed checklist item only when pack is ready", () => {
    const plan = proposeRecoveryActions(diagnostics([pack("east", "corrupt")]));
    const completed = { ...plan, items: plan.items.map((item) => ({ ...item, status: "complete" as const })) };
    expect(reconcileRecoveryActions(completed, [pack("east", "ready")]).items[0]?.status).toBe("complete");
  });
  it("does not make a completed download eligible again", () => {
    const plan = proposeRecoveryActions(diagnostics([pack("east", "corrupt")]));
    const item = { ...plan.items[0]!, status: "complete" as const };
    expect(actionEligibleForDownload(item, "east")).toBe(false);
  });
});

describe("bilingual action copy", () => {
  it("covers every action, priority and status in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const copy = actionsCopy(locale);
      for (const value of Object.values(copy.action)) expect(value.length).toBeGreaterThan(0);
      for (const value of Object.values(copy.details)) expect(value.length).toBeGreaterThan(0);
      for (const value of Object.values(copy.priority)) expect(value.length).toBeGreaterThan(0);
      for (const value of Object.values(copy.status)) expect(value.length).toBeGreaterThan(0);
    }
  });
  it("never labels a missing source as established", () => {
    expect(actionsCopy("en").details["review-source"]).toContain("UNKNOWN");
    expect(actionsCopy("fr").details["review-source"]).toContain("INCONNUS");
  });
});
