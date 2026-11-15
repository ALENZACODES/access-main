import { describe, expect, it } from "vitest";
import { DEMO_AS_OF, DEMO_OBSERVATIONS } from "./demo.ts";
import { buildEvidencePack } from "./pack.ts";
import { findPersonalData, validateCell, validateObservation, validatePack } from "./validate.ts";
import { obs } from "./test-helpers.ts";

const ok = (value: unknown) => validateObservation(value).ok;

describe("observation schema", () => {
  it("accepts every demonstration record", () => {
    for (const record of DEMO_OBSERVATIONS) expect(ok(record)).toBe(true);
  });

  it("accepts unknown as a first-class value for count, period, date and area", () => {
    expect(ok(obs({ count: "UNKNOWN" }))).toBe(true);
    expect(ok(obs({ period: "UNKNOWN", source_date: "UNKNOWN", area: "UNKNOWN", band: "unknown" }))).toBe(true);
    expect(ok(obs({ category: "unknown" }))).toBe(true);
  });

  it("refuses unknown written as zero, empty, null or negative", () => {
    expect(ok(obs({ count: -1 }))).toBe(false);
    expect(ok({ ...obs(), count: null })).toBe(false);
    expect(ok({ ...obs(), count: "" })).toBe(false);
    expect(ok({ ...obs(), count: 1.5 })).toBe(false);
  });

  it("refuses tiers 2, 3 and 4 and the VERIFIED and COMMUNITY-REPORTED labels", () => {
    for (const tier of [2, 3, 4]) expect(ok({ ...obs(), tier })).toBe(false);
    for (const label of ["VERIFIED", "COMMUNITY-REPORTED"]) expect(ok({ ...obs(), prototype_label: label })).toBe(false);
  });

  it("keeps tiers and labels consistent", () => {
    expect(ok(obs({ tier: 0, prototype_label: "SEEDED-OPEN-DATA" }))).toBe(true);
    expect(ok(obs({ tier: 1, prototype_label: "SEEDED-OPEN-DATA" }))).toBe(false);
    expect(ok(obs({ tier: 1, prototype_label: "PROTOTYPE-UNVERIFIED" }))).toBe(true);
    expect(ok(obs({ tier: "E", prototype_label: null }))).toBe(true);
    expect(ok(obs({ tier: "E", prototype_label: "PROTOTYPE-UNVERIFIED" }))).toBe(false);
  });

  it("refuses an unknown area that names a region, and a region named UNKNOWN", () => {
    expect(ok({ ...obs(), geography: { level: "unknown", id: "demo-region-a", community_size_band: "large" } })).toBe(false);
    expect(ok({ ...obs(), geography: { level: "region", id: "UNKNOWN", community_size_band: "large" } })).toBe(false);
  });

  it("refuses impossible dates and malformed periods", () => {
    expect(ok(obs({ source_date: "2026-02-31" }))).toBe(false);
    expect(ok(obs({ period: "2026-13" }))).toBe(false);
    expect(ok(obs({ period: "October 2026" }))).toBe(false);
  });

  it("refuses personal fields by key and email-shaped values", () => {
    for (const key of ["email", "name", "phone", "address", "postal_code", "latitude", "diagnosis", "user_id"]) {
      const result = validateObservation({ ...obs(), [key]: "x" });
      expect(result.ok).toBe(false);
    }
    expect(findPersonalData({ nested: { Email: "a" } })).toEqual([{ field: "nested.Email", code: "personal_field" }]);
    expect(findPersonalData({ source_name: "write to someone@example.org" })).toHaveLength(1);
    expect(ok(obs({ source_name: "Reported by someone@example.org" }))).toBe(false);
  });

  it("refuses extra keys", () => {
    expect(ok({ ...obs(), note: "free text" })).toBe(false);
  });
});

describe("cell schema", () => {
  const identity = {
    record_type: "advocacy_cell",
    schema_version: "advocacy-cell-1.0.0",
    category: "parking",
    geography: { level: "region", id: "demo-region-a" },
    period: "2026-10",
  };
  const provenance = {
    source_ids: ["example"],
    licences: ["not-a-real-dataset"],
    tiers: [0],
    prototype_labels: ["PROTOTYPE-UNVERIFIED"],
    latest_source_date: "2026-11-01",
  };

  it("accepts a suppressed cell with identity only", () => {
    expect(validateCell({ ...identity, state: "suppressed" }).ok).toBe(true);
  });

  it("refuses a suppressed cell that carries a count, a reason or provenance", () => {
    expect(validateCell({ ...identity, state: "suppressed", count: 2 }).ok).toBe(false);
    expect(validateCell({ ...identity, state: "suppressed", reason: "below_threshold" }).ok).toBe(false);
    expect(validateCell({ ...identity, state: "suppressed", provenance }).ok).toBe(false);
  });

  it("refuses a published cell below 3, and accepts one at 5", () => {
    const published = { ...identity, state: "published", example: true, headline_eligible: false, headline_exclusions: ["example_record"], provenance };
    expect(validateCell({ ...published, count: 2 }).ok).toBe(false);
    expect(validateCell({ ...published, count: 1 }).ok).toBe(false);
    expect(validateCell({ ...published, count: 5 }).ok).toBe(true);
  });

  it("refuses an unknown cell with a count", () => {
    const unknown = { ...identity, state: "unknown", example: true, provenance };
    expect(validateCell(unknown).ok).toBe(true);
    expect(validateCell({ ...unknown, count: 0 }).ok).toBe(false);
  });
});

describe("pack schema", () => {
  const { pack } = buildEvidencePack(DEMO_OBSERVATIONS, { asOf: DEMO_AS_OF });

  it("accepts the demonstration pack", () => {
    expect(validatePack(pack).ok).toBe(true);
  });

  it("refuses any province-wide total", () => {
    expect(validatePack({ ...pack, headline: { ...pack.headline, province_wide_total: 12345 } }).ok).toBe(false);
  });

  it("refuses a pack that publishes totals or does not withhold raw counts", () => {
    expect(validatePack({ ...pack, suppression: { ...pack.suppression, totals_published: true } }).ok).toBe(false);
    expect(validatePack({ ...pack, suppression: { ...pack.suppression, raw_counts_withheld: false } }).ok).toBe(false);
  });

  it("refuses a pack with a threshold below 3 or a missing as-of date", () => {
    expect(validatePack({ ...pack, suppression: { ...pack.suppression, k: 2 } }).ok).toBe(false);
    const withoutDate = Object.fromEntries(Object.entries(pack).filter(([key]) => key !== "as_of"));
    expect(validatePack(withoutDate).ok).toBe(false);
  });
});
