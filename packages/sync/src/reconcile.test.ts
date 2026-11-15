import { describe, expect, it } from "vitest";
import { demonstrationLeft, demonstrationRight } from "./demo.ts";
import { applyResolutions, checkSnapshot, reconcile } from "./reconcile.ts";
import { assertConflict, assertReport, assertSnapshot } from "./schema.ts";
import { outboxItem } from "./outbox.ts";

const copy = <T>(x: T): T => structuredClone(x);
const pair = () => [copy(demonstrationLeft), copy(demonstrationRight)] as const;

describe("offline reconciliation — demonstration data only", () => {
  it("validates all three JSON Schema draft 2020-12 shapes", () => {
    const [a, b] = pair();
    assertSnapshot(a);
    const report = reconcile(a, b);
    assertConflict(report.conflicts[0]);
    assertReport(report);
    expect(() => assertSnapshot({ ...a, label: "" })).toThrow();
    expect(() => assertReport({ ...report, conflicts: [{ ...report.conflicts[0], extra: true }] })).toThrow();
  });

  it("preserves a sourced fact against Unknown and records which side lacked it", () => {
    const [a, b] = pair();
    b.records[0]!.payload.test_attribute = "UNKNOWN";
    const report = reconcile(a, b);
    expect(report.merged.records[0]!.payload.test_attribute).toBe("option A");
    expect(report.merged.records[0]!.field_provenance?.test_attribute).toEqual(a.records[0]!.provenance);
    expect(report.unknown_observations).toContainEqual({ record_id: "demo-record", field: "test_attribute", side: "right" });
    expect(report.merged.records[0]!.payload.unknown_attribute).toBe("UNKNOWN");
    expect(report.merged.records[0]!.field_provenance).not.toHaveProperty("unknown_attribute");
    expect(report.conflicts).toHaveLength(0);
  });

  it("preserves missing-side Unknown and does not invent a value", () => {
    const [a, b] = pair();
    delete b.records[0]!.payload.test_attribute;
    const report = reconcile(a, b);
    expect(report.merged.records[0]!.payload.test_attribute).toBe("option A");
    expect(report.unknown_observations).toContainEqual({ record_id: "demo-record", field: "test_attribute", side: "right" });
    delete a.records[0]!.payload.test_attribute;
    const unknown = reconcile(a, b);
    expect(unknown.merged.records[0]!.payload.test_attribute).toBeUndefined();
  });

  it("does not silently select a conflicting sourced fact", () => {
    const [a, b] = pair();
    const report = reconcile(a, b);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({ record_id: "demo-record", field: "test_attribute",
      left: { value: "option A", provenance: { source_name: "Demonstration local pack" } },
      right: { value: "option B", provenance: { licence: "CC0-1.0 (demonstration)" } },
    });
    expect(report.merged.records[0]!.payload.test_attribute).toBe("UNKNOWN");
  });

  it("applies each explicit resolution, keeps original unchanged and rejects duplicates", () => {
    const report = reconcile(...pair());
    for (const [choice, expected] of [["left", "option A"], ["right", "option B"], ["unknown", "UNKNOWN"]] as const) {
      const next = applyResolutions(report, [{ record_id: "demo-record", field: "test_attribute", choice }]);
      expect(next.conflicts).toHaveLength(0);
      expect(next.merged.records[0]!.payload.test_attribute).toBe(expected);
      expect(next.merged.records[0]!.field_provenance?.test_attribute === undefined).toBe(choice === "unknown");
    }
    expect(report.conflicts).toHaveLength(1);
    expect(() => applyResolutions(report, [{ record_id: "demo-record", field: "test_attribute", choice: "left" },
      { record_id: "demo-record", field: "test_attribute", choice: "right" }])).toThrow(/Duplicate|not found/);
  });

  it("merges identical nested values and uses LWW for stored_at only", () => {
    const [a, b] = pair();
    a.records[0]!.payload.test_attribute = { a: 1, b: [true, false] };
    b.records[0]!.payload.test_attribute = { b: [true, false], a: 1 };
    const report = reconcile(a, b);
    expect(report.conflicts).toHaveLength(0);
    expect(report.merged.records[0]!.stored_at).toBe("2026-01-03T00:00:00Z");
    expect(report.metadata_lww).toEqual([{ record_id: "demo-record", field: "stored_at", chosen: "right" }]);
    expect(report.merged.records[0]!.payload.test_attribute).toEqual({ a: 1, b: [true, false] });
    expect(a.records[0]!.stored_at).toBe("2026-01-02T00:00:00Z");
  });

  it("rejects live elevator/disruption keys and live flags at any depth", () => {
    const [a, b] = pair();
    a.records[0]!.payload = { section: [{ elevator_status: "working" }] };
    expect(() => reconcile(a, b)).toThrow(/Live status/);
    const [c, d] = pair();
    (c.records[0] as unknown as { contains_live_status: boolean }).contains_live_status = true;
    expect(() => reconcile(c, d)).toThrow(/snapshot|status/i);
  });

  it("rejects unsafe tiers, forbidden private data and unprovenanced overrides", () => {
    const [a] = pair();
    (a.records[0]!.provenance as unknown as { tier: number }).tier = 3;
    expect(() => checkSnapshot(a)).toThrow();
    const [b] = pair();
    b.records[0]!.payload = { password: "secret" };
    expect(() => checkSnapshot(b)).toThrow(/Unsafe/);
    const [c] = pair();
    c.records[0]!.field_provenance = { unknown_attribute: c.records[0]!.provenance };
    expect(() => checkSnapshot(c)).toThrow(/Provenance without/);
  });

  it("keeps on-device queued notes without inventing any upload", () => {
    const [a, b] = pair();
    a.outbox.push(outboxItem({
      id: "demo-note",
      created_at: "2026-01-01T00:00:00Z",
      based_on_record_id: "demo-record",
      note: "Demonstration correction only",
    }));
    b.outbox = copy(a.outbox);
    const report = reconcile(a, b);
    expect(report.merged.outbox).toEqual(a.outbox);
    b.outbox[0]!.note = "A different note";
    expect(() => reconcile(a, b)).toThrow(/Conflicting on-device/);
  });

  it("rejects duplicate identities and mismatched titles", () => {
    const [a, b] = pair();
    a.records.push(copy(a.records[0]!));
    expect(() => checkSnapshot(a)).toThrow(/Duplicate record/);
    a.records.pop();
    b.records[0]!.title = "Different title";
    expect(() => reconcile(a, b)).toThrow(/Identity metadata/);
  });

  it("accepts an empty report and separate records without conflicts", () => {
    const [a, b] = pair();
    a.records = [];
    b.records = [];
    expect(reconcile(a, b).merged.records).toEqual([]);
    b.records = copy(demonstrationRight.records);
    expect(reconcile(a, b).merged.records).toHaveLength(1);
  });
});
