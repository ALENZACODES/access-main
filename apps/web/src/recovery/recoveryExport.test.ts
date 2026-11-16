import { describe, expect, it, vi } from "vitest";
import {
  createRecoveryExport,
  saveRecoveryExport,
  type RecoveryExportRecord,
} from "./recoveryExport";

const createdAt = "2026-11-15T20:30:00.000Z";
const record: RecoveryExportRecord = {
  id: "pack-on",
  packId: "pack-on",
  state: "ready",
  source: { name: "Example", licence: "CC-BY-4.0", date: "2026-11-15" },
  checkedAt: createdAt,
};

describe("local recovery export", () => {
  it("generates deterministic sorted JSON with source, licence and date", () => {
    const result = createRecoveryExport([
      { ...record, id: "z" }, { ...record, id: "a" },
    ], createdAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe("pack-recovery-2026-11-15.json");
    const parsed = JSON.parse(result.content) as {
      format: string;
      records: RecoveryExportRecord[];
    };
    expect(parsed.format).toBe("local-pack-recovery-v1");
    expect(parsed.records.map((item) => item.id)).toEqual(["a", "z"]);
    expect(parsed.records[0]?.source).toEqual(record.source);
  });

  it("never upgrades unproven ready records to ready", () => {
    const result = createRecoveryExport([{ ...record, source: undefined }], createdAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.content).records[0].state).toBe("unknown");
  });

  it("rejects unsupported licences, malformed dates and duplicate IDs", () => {
    expect(createRecoveryExport([{ ...record, source: {
      name: "Not supported", licence: "proprietary", date: "2026-11-15",
    } }], createdAt).ok).toBe(false);
    expect(createRecoveryExport([{ ...record, source: {
      name: "Example", licence: "CC0-1.0", date: "2026-02-30",
    } }], createdAt).ok).toBe(false);
    expect(createRecoveryExport([record, record], createdAt).ok).toBe(false);
  });

  it("rejects unexpected record contents and invalid timestamps", () => {
    expect(createRecoveryExport([{ ...record, id: "x\u0000y" }], createdAt).ok).toBe(false);
    expect(createRecoveryExport([record], "yesterday").ok).toBe(false);
    expect(createRecoveryExport([{ ...record, checkedAt: "unknown" }], createdAt).ok).toBe(false);
  });

  it("enforces record and byte budgets", () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({ ...record, id: `id-${i}` }));
    expect(createRecoveryExport(many, createdAt).ok).toBe(false);
    const large = Array.from({ length: 2000 }, (_, i) => ({
      ...record, id: `id-${i}`, packId: "p".repeat(256),
      reason: "r".repeat(256),
    }));
    expect(createRecoveryExport(large, createdAt).ok).toBe(false);
  });

  it("saves only on an explicit callback invocation", async () => {
    const save = vi.fn(async () => undefined);
    const result = await saveRecoveryExport([record], createdAt, save);
    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]).toHaveLength(2);
  });

  it("reports save failures without leaking raw exception text", async () => {
    const error = new Error("private filesystem location");
    error.name = "NotAllowedError";
    const result = await saveRecoveryExport([record], createdAt, async () => {
      throw error;
    });
    expect(result).toEqual({ ok: false, reason: "permission" });
    expect(JSON.stringify(result)).not.toContain("private filesystem location");
  });
});
