import { describe, expect, it, vi } from "vitest";
import { createRecoveryBatch, updateRecoveryBatch } from "./recoveryBatch";
import { emptyRecoveryLedger } from "./recoveryLedger";
import { createLocalPlanExport, planExportCopy, saveLocalPlanExport } from "./recoveryPlanExport";
import { planPackRepairs } from "./recoveryPolicy";

const day = "2026-11-15";
const source = { name: "Provincial data", licence: "OGL-ON-1.0", date: "2026-10-01" };
const policy = () => planPackRepairs([
  { id: "one", state: "ready", byteLength: 100, source },
  { id: "two", state: "corrupt", byteLength: 20, source },
  { id: "three", state: "unknown" },
], { date: day });
const create = () => {
  const p = policy();
  return { p, batch: createRecoveryBatch(p.recommendations), ledger: emptyRecoveryLedger() };
};

describe("recovery plan JSON", () => {
  it("exports a bounded document of observed states and metadata", () => {
    const { p, batch, ledger } = create();
    const result = createLocalPlanExport(p, batch, ledger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe("pack-recovery-plan-2026-11-15.json");
    const document = JSON.parse(result.content) as {
      format: string; inspectionDate: string; outcome: string;
      entries: Array<{ packId: string; localState: string; source: unknown }>;
    };
    expect(document.format).toBe("local-recovery-plan-v1");
    expect(document.inspectionDate).toBe(day);
    expect(document.outcome).toBe("needs-action");
    expect(document.entries.map((entry) => entry.packId)).toEqual(["one", "three", "two"]);
    expect(document.entries.find((entry) => entry.packId === "three")?.localState).toBe("unknown");
    expect(document.entries.find((entry) => entry.packId === "one")?.source).toEqual(source);
  });

  it("does not expose file bytes, download endpoints or device identifiers", () => {
    const { p, batch, ledger } = create();
    const result = createLocalPlanExport(p, batch, ledger);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).not.toContain("byteLength");
    expect(result.content).not.toContain("downloadUrl");
    expect(result.content).not.toContain("deviceId");
    expect(result.content).not.toContain("coordinates");
    expect(result.content).not.toContain("latitude");
    expect(result.content).not.toContain("longitude");
  });

  it("keeps UNKNOWN unknown in the output", () => {
    const { p, batch, ledger } = create();
    const result = createLocalPlanExport(p, batch, ledger);
    if (!result.ok) throw new Error("Unexpected export error");
    const document = JSON.parse(result.content) as {
      entries: Array<{ packId: string; localState: string }>;
    };
    expect(document.entries.find((entry) => entry.packId === "three")?.localState).toBe("unknown");
  });

  it("records actual source/licence/date rather than substituting another source", () => {
    const { p, batch, ledger } = create();
    const result = createLocalPlanExport(p, batch, ledger);
    if (!result.ok) throw new Error("Unexpected export error");
    expect(result.content).toContain("OGL-ON-1.0");
    expect(result.content).toContain("2026-10-01");
    expect(result.content).toContain("Provincial data");
  });

  it("does not export unsupported source licence metadata", () => {
    const p = planPackRepairs([
      { id: "one", state: "ready", source: { ...source, licence: "Restricted" } },
    ], { date: day });
    const batch = createRecoveryBatch(p.recommendations);
    const result = createLocalPlanExport(p, batch, emptyRecoveryLedger());
    if (!result.ok) throw new Error("Unexpected export error");
    const document = JSON.parse(result.content) as { entries: Array<{ source: unknown }> };
    expect(document.entries[0]?.source).toBeNull();
  });

  it("does not export a future source date as supported provenance", () => {
    const p = planPackRepairs([
      { id: "one", state: "ready", source: { ...source, date: "2027-01-01" } },
    ], { date: day });
    const batch = createRecoveryBatch(p.recommendations);
    const result = createLocalPlanExport(p, batch, emptyRecoveryLedger());
    if (!result.ok) throw new Error("Unexpected export error");
    const document = JSON.parse(result.content) as { entries: Array<{ source: unknown }> };
    expect(document.entries[0]?.source).toBeNull();
  });

  it("does not export invalid source dates", () => {
    for (const date of ["", "today", "2026-02-30", "2026/01/01"]) {
      const p = planPackRepairs([
        { id: "one", state: "ready", source: { ...source, date } },
      ], { date: day });
      const batch = createRecoveryBatch(p.recommendations);
      const result = createLocalPlanExport(p, batch, emptyRecoveryLedger());
      if (!result.ok) throw new Error("Unexpected export error");
      const document = JSON.parse(result.content) as { entries: Array<{ source: unknown }> };
      expect(document.entries[0]?.source).toBeNull();
    }
  });

  it("does not export unsafe source text", () => {
    const p = planPackRepairs([
      { id: "one", state: "ready", source: { ...source, name: "bad\u0000name" } },
    ], { date: day });
    const batch = createRecoveryBatch(p.recommendations);
    const result = createLocalPlanExport(p, batch, emptyRecoveryLedger());
    if (!result.ok) throw new Error("Unexpected export error");
    const document = JSON.parse(result.content) as { entries: Array<{ source: unknown }> };
    expect(document.entries[0]?.source).toBeNull();
  });

  it("does not accept an unsupported inspection date", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport({ ...p, date: "2026-02-30" }, batch, ledger)).toEqual({
      ok: false, reason: "unsafe",
    });
  });

  it("does not export an incomplete queue", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport(p, { ...batch, items: batch.items.slice(1) }, ledger)).toEqual({
      ok: false, reason: "unsafe",
    });
  });

  it("rejects duplicate queue IDs", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport(p, {
      ...batch, items: [...batch.items, batch.items[0]!],
    }, ledger)).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects duplicate policy IDs", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport({
      ...p, recommendations: [...p.recommendations, p.recommendations[0]!],
    }, batch, ledger)).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects an injected queue stage", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport(p, {
      ...batch, items: [
        { ...batch.items[0]!, stage: "auto-success" as "done" },
        ...batch.items.slice(1),
      ],
    }, ledger)).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects an injected ready state from an external record", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport({
      ...p, recommendations: [
        { ...p.recommendations[0]!, state: "auto-ready" as "ready" },
        ...p.recommendations.slice(1),
      ],
    }, batch, ledger)).toEqual({ ok: false, reason: "unsafe" });
  });

  it("rejects an unsafe ID instead of hiding it from the exported list", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport({
      ...p, recommendations: [
        { ...p.recommendations[0]!, id: "../private" },
        ...p.recommendations.slice(1),
      ],
    }, batch, ledger)).toEqual({ ok: false, reason: "unsafe" });
  });

  it("sorts plan entries without changing the queue order", () => {
    const { p, batch, ledger } = create();
    const before = batch.items.map((item) => item.id);
    const result = createLocalPlanExport(p, batch, ledger);
    expect(result.ok).toBe(true);
    expect(batch.items.map((item) => item.id)).toEqual(before);
    expect(p.recommendations.map((item) => item.id)).toEqual(before);
  });

  it("rejects unsupported batch version", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport(p, { ...batch, version: 2 as 1 }, ledger)).toEqual({
      ok: false, reason: "unsafe",
    });
  });

  it("rejects modified imported history", () => {
    const { p, batch, ledger } = create();
    expect(createLocalPlanExport(p, batch, { ...ledger, nextNumber: -2 })).toEqual({
      ok: false, reason: "unsafe",
    });
  });

  it("includes explicit queue choices without claiming a completed transfer", () => {
    const { p, batch, ledger } = create();
    const result = updateRecoveryBatch(batch, { id: "two", decision: "select", userInitiated: true });
    if (!result.ok) throw new Error("Queue update failed");
    const exported = createLocalPlanExport(p, result.batch, ledger);
    if (!exported.ok) throw new Error("Plan export failed");
    const document = JSON.parse(exported.content) as {
      entries: Array<{ packId: string; queueStage: string }>;
    };
    expect(document.entries.find((item) => item.packId === "two")?.queueStage).toBe("selected");
  });

  it("returns save failure without making a second attempt", async () => {
    const { p, batch, ledger } = create();
    const save = vi.fn(async () => { throw new Error("private save details"); });
    const result = await saveLocalPlanExport(p, batch, ledger, save);
    expect(result).toEqual({ ok: false, reason: "save-failed" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("private save details");
  });

  it("saves once through the provided callback", async () => {
    const { p, batch, ledger } = create();
    const save = vi.fn<(name: string, content: string) => Promise<void>>(async () => {});
    const result = await saveLocalPlanExport(p, batch, ledger, save);
    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0]).toBe("pack-recovery-plan-2026-11-15.json");
  });

  it("does not call the save callback on malformed input", async () => {
    const { p, batch, ledger } = create();
    const save = vi.fn(async () => {});
    const result = await saveLocalPlanExport({ ...p, date: null }, batch, ledger, save);
    expect(result).toEqual({ ok: false, reason: "unsafe" });
    expect(save).not.toHaveBeenCalled();
  });

  it("has distinct accessible button and error text in each locale", () => {
    const en = planExportCopy("en");
    const fr = planExportCopy("fr");
    for (const key of ["heading", "description", "action", "success", "unsafe", "tooLarge", "failed", "unavailable"] as const) {
      expect(en[key].length).toBeGreaterThan(4);
      expect(fr[key].length).toBeGreaterThan(4);
      expect(en[key]).not.toBe(fr[key]);
    }
  });
});
