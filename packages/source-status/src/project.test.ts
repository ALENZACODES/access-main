import { describe, expect, it } from "vitest";
import { DEMONSTRATION_REGISTER } from "./fixtures/demonstration.ts";
import { projectRegister } from "./project.ts";
import { validateSourceRegister } from "./validate.ts";
import type { SourceEntry } from "./types.ts";

const clone = (entry: SourceEntry): SourceEntry => structuredClone(entry);

describe("source register", () => {
  it("projects an empty register without claiming coverage", () => {
    const result = projectRegister([]);
    expect(result.rows).toEqual([]);
    expect(result.totals.source_count).toBe(0);
    expect(result.totals.non_demonstration_records).toBe(0);
    expect(result.totals.tier_histogram).toEqual([]);
  });

  it("keeps demonstration sources and tier labels visible but excluded from headline", () => {
    const result = projectRegister(DEMONSTRATION_REGISTER);
    expect(result.totals.source_count).toBe(2);
    expect(result.totals.demonstration_records).toBe(3);
    expect(result.totals.non_demonstration_records).toBe(0);
    expect(result.totals.known_unknown_fields).toBe(2);
    expect(result.totals.tier_histogram).toEqual([
      { tier: 0, prototype_label: "SEEDED-OPEN-DATA", count: 3 },
    ]);
    expect(result.rows.every((row) => row.excluded_from_headline)).toBe(true);
  });

  it("excludes example:true even without demonstration:true", () => {
    const example = clone(DEMONSTRATION_REGISTER[0]!);
    example.demonstration = false;
    example.example = true;
    expect(projectRegister([example]).totals.non_demonstration_records).toBe(0);
    example.example = false;
    expect(projectRegister([example]).totals.non_demonstration_records).toBe(3);
  });

  it("preserves Unknown URLs and missing retrieval dates", () => {
    const result = projectRegister(DEMONSTRATION_REGISTER);
    expect(result.rows[0]?.official_url).toBe("Unknown");
    expect(result.rows[1]?.retrieved_on).toBe("Unknown");
    expect(result.rows[1]?.as_of).toBe("Unknown");
  });

  it("does not treat unknown counts as zero known counts", () => {
    const unknown = clone(DEMONSTRATION_REGISTER[1]!);
    unknown.record_count = "Unknown";
    unknown.unknown_field_count = "Unknown";
    const totals = projectRegister([unknown]).totals;
    expect(totals.unknown_record_count_sources).toBe(1);
    expect(totals.unknown_field_count_sources).toBe(1);
  });

  it("rejects invalid URLs, duplicate ids, unsupported tiers and labels", () => {
    const sample = clone(DEMONSTRATION_REGISTER[0]!);
    expect(validateSourceRegister([sample, sample])).toBe(false);
    expect(validateSourceRegister([{ ...sample, official_url: "http://insecure.example" }])).toBe(false);
    expect(validateSourceRegister([{ ...sample, provenance: { ...sample.provenance, tier: 3 } }])).toBe(false);
    expect(validateSourceRegister([{ ...sample, provenance: { ...sample.provenance, prototype_label: "VERIFIED" } }])).toBe(false);
    expect(validateSourceRegister([{ ...sample, tier_histogram: [{ tier: 0, prototype_label: "SEEDED-OPEN-DATA", count: 4 }] }])).toBe(false);
  });

  it("rejects fabricated and non-calendar dates, and mismatched provenance", () => {
    const sample = clone(DEMONSTRATION_REGISTER[0]!);
    expect(validateSourceRegister([{ ...sample, retrieved_on: "2026-02-30" }])).toBe(false);
    expect(validateSourceRegister([{ ...sample, provenance: { ...sample.provenance, licence: "different" } }])).toBe(false);
    expect(validateSourceRegister(DEMONSTRATION_REGISTER)).toBe(true);
  });
});
