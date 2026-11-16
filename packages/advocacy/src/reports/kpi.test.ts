import { describe, expect, it } from "vitest";
import { DEMO_CONSENT_LEDGER, DEMO_INPUT_SETS, DEMO_PURPOSE, DEMO_REGIONS, DEMO_REPORTS, DEMO_REPORT_AS_OF } from "./demo.ts";
import {
  INDICATORS,
  KPI_STAGES,
  computeIndicators,
  logicModel,
  validateIndicator,
  type CitationRecord,
  type IncidentReview,
  type KpiRecords,
  type PackDelivery,
} from "./kpi.ts";
import { buildReportEvidencePack } from "./pack.ts";
import type { ReportEvidencePack } from "./types.ts";

const EMPTY: KpiRecords = { packs: [], deliveries: [], citations: [], reviews: [] };

function demoPack(asOf = DEMO_REPORT_AS_OF): ReportEvidencePack {
  const result = buildReportEvidencePack(
    { reports: DEMO_REPORTS, inputSets: DEMO_INPUT_SETS, regions: DEMO_REGIONS, consentLedger: DEMO_CONSENT_LEDGER },
    { asOf, requiredPurpose: DEMO_PURPOSE },
  );
  if (!result.ok) throw new Error("demo pack refused");
  return result.pack;
}

const delivery = (id: string, on: string, campaign: PackDelivery["campaign"] = "parking"): PackDelivery => ({
  record_type: "advocacy_pack_delivery",
  id,
  example: true,
  campaign,
  delivered_on: on,
  pack_fingerprint: "fnv1a-0000000000000000",
});
const citation = (id: string, on: string): CitationRecord => ({
  record_type: "advocacy_citation",
  id,
  example: true,
  campaign: "parking",
  cited_on: on,
  pack_fingerprint: "fnv1a-0000000000000000",
  source_url: null,
});
const review = (id: string, on: string, found: number): IncidentReview => ({ record_type: "advocacy_incident_review", id, example: true, reviewed_on: on, incidents_found: found });

describe("indicator definitions are data", () => {
  it("cover the three stages of the logic model and are valid", () => {
    expect(new Set(INDICATORS.map((i) => i.stage))).toEqual(new Set(KPI_STAGES));
    for (const definition of INDICATORS) expect(validateIndicator(definition).ok).toBe(true);
    expect(new Set(INDICATORS.map((i) => i.id)).size).toBe(INDICATORS.length);
  });

  it("have no baseline, target or figure of any kind", () => {
    for (const definition of INDICATORS) {
      expect(Object.keys(definition).every((key) => ["record_type", "schema_version", "id", "stage", "measure", "campaign"].includes(key))).toBe(true);
      expect(Object.values(definition).some((value) => typeof value === "number")).toBe(false);
    }
  });

  it("refuse a definition that tries to carry a baseline or a target", () => {
    const base = INDICATORS[0];
    for (const extra of [{ baseline: 100 }, { target: 500 }, { goal: 1 }, { expected_value: 3 }]) {
      expect(validateIndicator({ ...base, ...extra }).ok).toBe(false);
      expect(() => computeIndicators([{ ...base, ...extra } as never], EMPTY)).toThrow(/not valid/);
    }
    expect(validateIndicator({ ...base, stage: "impact" }).ok).toBe(false);
    expect(validateIndicator({ ...base, measure: "made_up" }).ok).toBe(false);
  });
});

describe("indicators are computed only from records", () => {
  it("say no data yet for every indicator when there are no records, never zero", () => {
    const results = computeIndicators(INDICATORS, EMPTY);
    expect(results).toHaveLength(INDICATORS.length);
    for (const result of results) {
      expect(result.state).toBe("no_data");
      expect("value" in result).toBe(false);
    }
  });

  it("read report counts from the published tables of the latest pack", () => {
    const pack = demoPack();
    const results = computeIndicators(INDICATORS, { ...EMPTY, packs: [pack] });
    const byId = new Map(results.map((r) => [r.id, r]));
    expect(byId.get("input_sets")).toMatchObject({ state: "value", value: 1, from_example_records: true });
    expect(byId.get("reports_parking")).toMatchObject({ state: "value", value: 92 });
    expect(byId.get("reports_barrier")).toMatchObject({ state: "value", value: 36 });
    expect(byId.get("reports_housing_wait")).toMatchObject({ state: "value", value: 25 });
    expect(byId.get("tables_published")).toMatchObject({ state: "value", value: 3 });
  });

  it("never shows a count for a campaign whose only table was withheld", () => {
    const results = computeIndicators(INDICATORS, { ...EMPTY, packs: [demoPack()] });
    expect(results.find((r) => r.id === "reports_coverage")).toMatchObject({ state: "no_data" });
    for (const result of results.filter((r) => r.measure === "reports_in_published_tables")) {
      if (result.state === "value") expect(result.value).toBeGreaterThanOrEqual(5);
    }
  });

  it("uses the pack with the latest as-of date", () => {
    const older = demoPack("2026-10-01");
    const newer = { ...demoPack("2026-11-20"), provenance: [] };
    const results = computeIndicators(INDICATORS, { ...EMPTY, packs: [newer, older] });
    expect(results.find((r) => r.id === "input_sets")).toMatchObject({ state: "value", value: 0 });
  });

  it("counts deliveries and citations that were logged, by year and by campaign", () => {
    const records: KpiRecords = {
      ...EMPTY,
      deliveries: [delivery("d-1", "2026-03-01"), delivery("d-2", "2026-09-01", "coverage"), delivery("d-3", "2025-12-31")],
      citations: [citation("c-1", "2026-10-10")],
    };
    const all = computeIndicators(INDICATORS, records);
    expect(all.find((r) => r.id === "packs_delivered")).toMatchObject({ state: "value", value: 3, records_used: 3 });
    const year = computeIndicators(INDICATORS, records, { year: 2026 });
    expect(year.find((r) => r.id === "packs_delivered")).toMatchObject({ state: "value", value: 2 });
    expect(year.find((r) => r.id === "citations_logged")).toMatchObject({ state: "value", value: 1 });
    expect(computeIndicators(INDICATORS, records, { year: 2024 }).find((r) => r.id === "packs_delivered")).toMatchObject({ state: "no_data" });
    const coverage = computeIndicators(
      [{ record_type: "advocacy_indicator", schema_version: "advocacy-indicator-1.0.0", id: "packs_coverage", stage: "output", measure: "packs_delivered", campaign: "coverage" }],
      records,
    );
    expect(coverage[0]).toMatchObject({ state: "value", value: 1, campaign: "coverage" });
  });

  it("reports zero incidents only when a review was completed, and no data before that", () => {
    expect(computeIndicators(INDICATORS, EMPTY).find((r) => r.id === "incidents_found")).toMatchObject({ state: "no_data" });
    const reviewed = computeIndicators(INDICATORS, { ...EMPTY, reviews: [review("r-1", "2026-06-30", 0), review("r-2", "2026-09-30", 0)] });
    expect(reviewed.find((r) => r.id === "incidents_found")).toMatchObject({ state: "value", value: 0, records_used: 2 });
    const found = computeIndicators(INDICATORS, { ...EMPTY, reviews: [review("r-1", "2026-06-30", 1)] });
    expect(found.find((r) => r.id === "incidents_found")).toMatchObject({ state: "value", value: 1 });
  });

  it("ignores records with a date that is not real", () => {
    const records: KpiRecords = { ...EMPTY, deliveries: [delivery("d-1", "2026-02-30"), delivery("d-2", "soon")] };
    expect(computeIndicators(INDICATORS, records).find((r) => r.id === "packs_delivered")).toMatchObject({ state: "no_data" });
  });

  it("groups results by stage in the order input, output, outcome", () => {
    const model = logicModel(computeIndicators(INDICATORS, EMPTY));
    expect(model.map((group) => group.stage)).toEqual(["input", "output", "outcome"]);
    expect(model.map((group) => group.indicators.length)).toEqual([5, 2, 2]);
  });
});
