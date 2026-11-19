import { describe, expect, it } from "vitest";
import type { LocalPackRecord } from "./packInventory";
import { calculateRecoveryDryRun, exportRecoveryDryRun, DRY_RUN_LIMITS } from "./recoveryDryRun";
import { recoveryDryRunCopy } from "./recoveryDryRunCopy";

const source = { name: "Ontario open catalogue", licence: "OGL-ON-1.0", date: "2026-11-01" };
const day = "2026-11-19";
const item = (id: string, state: LocalPackRecord["state"] = "absent", bytes: number | undefined = 100): LocalPackRecord =>
  ({ id, state, ...(bytes === undefined ? {} : { byteLength: bytes }), source });
const plan = (records: LocalPackRecord[], options: Partial<Parameters<typeof calculateRecoveryDryRun>[0]> = {}) =>
  calculateRecoveryDryRun({ records, availableBytes: 1000, reserveBytes: 100, inspectionDate: day,
    selectedIds: records.map((record) => record.id), ...options });

const find = (result: ReturnType<typeof plan>, id: string) => result.entries.find((entry) => entry.id === id);

describe("recovery storage rehearsal", () => {
  it("allocates known amounts after reserving storage", () => {
    const result = plan([item("one", "absent", 200), item("two", "corrupt", 300)]);
    expect(result.status).toBe("calculated");
    expect(result.budgetBytes).toBe(900);
    expect(result.allocatedBytes).toBe(500);
    expect(result.remainingBytes).toBe(400);
    expect(result.entries.every((entry) => entry.disposition === "candidate")).toBe(true);
  });

  it("does not promote unknown or ready states", () => {
    const result = plan([item("unknown", "unknown"), item("ready", "ready")]);
    expect(find(result, "unknown")?.disposition).toBe("unknown");
    expect(find(result, "ready")?.disposition).toBe("already-present");
    expect(result.allocatedBytes).toBe(0);
  });

  it("leaves absent sizes unknown, rather than guessing", () => {
    const result = plan([{ id: "a", state: "absent", source }]);
    expect(find(result, "a")?.reason).toBe("unknown-bytes");
    expect(find(result, "a")?.expectedBytes).toBeNull();
  });

  it("honours explicit deselection", () => {
    const result = plan([item("a"), item("b")], { selectedIds: ["b"] });
    expect(find(result, "a")?.reason).toBe("not-selected");
    expect(find(result, "b")?.disposition).toBe("candidate");
  });

  it("records insufficient space without allocating a partial copy", () => {
    const result = plan([item("a", "corrupt", 901), item("b", "absent", 200)]);
    expect(find(result, "a")?.disposition).toBe("insufficient-space");
    expect(find(result, "b")?.disposition).toBe("candidate");
    expect(result.allocatedBytes).toBe(200);
  });

  it("uses user priorities for decisions and sorts display deterministically", () => {
    const result = plan([item("alpha", "absent", 600), item("zeta", "absent", 600)],
      { priorities: { zeta: "high", alpha: "low" } });
    expect(find(result, "zeta")?.disposition).toBe("candidate");
    expect(find(result, "alpha")?.disposition).toBe("insufficient-space");
    expect(result.entries.map((entry) => entry.id)).toEqual(["alpha", "zeta"]);
  });

  it("refuses unknown storage headroom", () => {
    for (const capacity of [null, -1, 1.2, Infinity, Number.NaN]) {
      const result = plan([item("a")], { availableBytes: capacity });
      expect(result.status).toBe("unknown");
      expect(find(result, "a")?.disposition).toBe("unknown");
      expect(result.allocatedBytes).toBe(0);
    }
  });

  it("refuses impossible reserve", () => {
    for (const reserve of [-2, 1001, 1.2, Number.NaN]) {
      const result = plan([item("a")], { reserveBytes: reserve });
      expect(result.status).toBe("unknown");
      expect(result.allocatedBytes).toBe(0);
    }
  });

  it("rejects duplicate identities", () => {
    const result = plan([item("same"), item("same")]);
    expect(result.entries.map((entry) => entry.reason)).toEqual(["duplicate-pack", "duplicate-pack"]);
  });

  it("rejects unsafe identities", () => {
    const result = plan([item("../../escape"), item("bad space"), item("a".repeat(129))]);
    expect(result.entries.every((entry) => entry.reason === "invalid-pack-id")).toBe(true);
  });

  it("rejects malformed inspection date", () => {
    const result = plan([item("a")], { inspectionDate: "2026-02-30" });
    expect(result.status).toBe("unknown");
    expect(result.allocatedBytes).toBe(0);
  });

  it("requires a source before selection", () => {
    const result = plan([{ id: "a", state: "absent", byteLength: 10 }]);
    expect(find(result, "a")?.reason).toBe("unknown-source");
  });

  it("rejects restricted licences", () => {
    const result = plan([{ ...item("a"), source: { ...source, licence: "private" } }]);
    expect(find(result, "a")?.reason).toBe("closed-licence");
  });

  it("rejects invalid and future source dates", () => {
    const invalid = plan([{ ...item("a"), source: { ...source, date: "2026-02-30" } }]);
    const future = plan([{ ...item("a"), source: { ...source, date: "2027-01-01" } }]);
    expect(find(invalid, "a")?.reason).toBe("invalid-source-date");
    expect(find(future, "a")?.reason).toBe("future-source-date");
  });

  it("keeps distinct open licences accepted", () => {
    for (const licence of ["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0"]) {
      const result = plan([{ ...item("a"), source: { ...source, licence } }]);
      expect(find(result, "a")?.disposition).toBe("candidate");
    }
  });

  it("rejects excessive pack count without allocating", () => {
    const records = Array.from({ length: DRY_RUN_LIMITS.maxPacks + 1 }, (_, i) => item(`item-${i}`));
    const result = plan(records);
    expect(result.status).toBe("unknown");
    expect(result.allocatedBytes).toBe(0);
  });

  it("rejects amounts above the safety limit", () => {
    const result = plan([item("a", "absent", DRY_RUN_LIMITS.maxBytes + 1)]);
    expect(find(result, "a")?.reason).toBe("unknown-bytes");
  });
});

describe("export rehearsal", () => {
  it("preserves UNKNOWN and sources in a local-only JSON report", () => {
    const result = plan([item("a"), item("b", "unknown")]);
    const text = exportRecoveryDryRun(result, "en", "2026-11-19T12:00:00.000Z");
    expect(text).not.toBeNull();
    const payload = JSON.parse(text!) as { plan: typeof result; format: string };
    expect(payload.format).toBe("recovery-dry-run-v1");
    expect(payload.plan.entries.find((entry) => entry.id === "b")?.disposition).toBe("unknown");
    expect(payload.plan.entries.find((entry) => entry.id === "a")?.source?.licence).toBe(source.licence);
  });

  it("refuses unsafe date or missing source on export", () => {
    const result = plan([item("a")]);
    expect(exportRecoveryDryRun(result, "en", "not-a-date")).toBeNull();
    const unsafe = { ...result, entries: [{ ...result.entries[0]!, id: "../unsafe" }] };
    expect(exportRecoveryDryRun(unsafe, "fr", "2026-11-19T12:00:00.000Z")).toBeNull();
  });
});

describe("two language copy", () => {
  it("includes all outcomes in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      const copy = recoveryDryRunCopy(locale);
      expect(copy.heading.length).toBeGreaterThan(4);
      for (const result of plan([item("a"), item("b", "unknown")]).entries) {
        expect(copy.status[result.disposition].length).toBeGreaterThan(1);
        expect(copy.reasons[result.reason].length).toBeGreaterThan(1);
      }
    }
  });
});
