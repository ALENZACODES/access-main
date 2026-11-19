/**
 * Logic-model indicators. An indicator is a line of data: an id, a stage of the logic model
 * (input, output, outcome) and a measure. A value is computed only from records that exist on
 * the device. With no records the result is "no data yet", never zero. A definition has no
 * baseline and no target field, and the validator refuses any extra field.
 *
 * Report counts are read from built packs, never from raw reports, so an indicator can never
 * show a count that the pack withheld.
 */
import Ajv2020 from "ajv/dist/2020.js";
import { isRealDate } from "../dates.ts";
import { findPersonalData, type ValidationIssue, type ValidationResult } from "../validate.ts";
import { REPORT_KINDS, type ReportEvidencePack, type ReportKind } from "./types.ts";

export const KPI_STAGES = ["input", "output", "outcome"] as const;
export type KpiStage = (typeof KPI_STAGES)[number];

export const KPI_MEASURES = [
  "input_sets_in_latest_pack",
  "reports_in_published_tables",
  "tables_published_in_latest_pack",
  "packs_delivered",
  "citations_logged",
  "incidents_found_in_reviews",
] as const;
export type KpiMeasure = (typeof KPI_MEASURES)[number];

export interface IndicatorDefinition {
  record_type: "advocacy_indicator";
  schema_version: "advocacy-indicator-1.0.0";
  id: string;
  stage: KpiStage;
  measure: KpiMeasure;
  /** Limits the measure to one campaign. Omitted for all campaigns. */
  campaign?: ReportKind;
}

/** A pack that was handed to someone. Logged by the person who delivered it. */
export interface PackDelivery {
  record_type: "advocacy_pack_delivery";
  id: string;
  example: boolean;
  campaign: ReportKind;
  /** YYYY-MM-DD. */
  delivered_on: string;
  pack_fingerprint: string;
}

/** A published table from a pack was cited by a public body. Logged by hand with its source link. */
export interface CitationRecord {
  record_type: "advocacy_citation";
  id: string;
  example: boolean;
  campaign: ReportKind;
  /** YYYY-MM-DD. */
  cited_on: string;
  pack_fingerprint: string;
  source_url: string | null;
}

/** A completed review of whether anyone could be identified from published packs. */
export interface IncidentReview {
  record_type: "advocacy_incident_review";
  id: string;
  example: boolean;
  /** YYYY-MM-DD. */
  reviewed_on: string;
  incidents_found: number;
}

export interface KpiRecords {
  packs: readonly ReportEvidencePack[];
  deliveries: readonly PackDelivery[];
  citations: readonly CitationRecord[];
  reviews: readonly IncidentReview[];
}

export interface KpiOptions {
  /** Count dated records of this calendar year only. Omitted for all years. */
  year?: number;
}

export type KpiResult = {
  id: string;
  stage: KpiStage;
  measure: KpiMeasure;
  campaign: ReportKind | null;
} & ({ state: "no_data" } | { state: "value"; value: number; records_used: number; from_example_records: boolean });

const TOKEN = "^[a-z0-9][a-z0-9_.-]{1,63}$";
const ajv = new Ajv2020({ allErrors: true, strict: true });
const indicatorFn = ajv.compile({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:access-main:advocacy:indicator:1.0.0",
  type: "object",
  additionalProperties: false,
  required: ["record_type", "schema_version", "id", "stage", "measure"],
  properties: {
    record_type: { const: "advocacy_indicator" },
    schema_version: { const: "advocacy-indicator-1.0.0" },
    id: { type: "string", pattern: TOKEN },
    stage: { enum: [...KPI_STAGES] },
    measure: { enum: [...KPI_MEASURES] },
    campaign: { enum: [...REPORT_KINDS] },
  },
});

export function validateIndicator(value: unknown): ValidationResult<IndicatorDefinition> {
  const issues: ValidationIssue[] = findPersonalData(value);
  if (!indicatorFn(value)) {
    for (const error of indicatorFn.errors ?? []) issues.push({ field: error.instancePath || "(root)", code: error.keyword });
  }
  return issues.length === 0 ? { ok: true, value: value as IndicatorDefinition } : { ok: false, issues };
}

function indicator(id: string, stage: KpiStage, measure: KpiMeasure, campaign?: ReportKind): IndicatorDefinition {
  return { record_type: "advocacy_indicator", schema_version: "advocacy-indicator-1.0.0", id, stage, measure, ...(campaign ? { campaign } : {}) };
}

/**
 * The indicators this package ships. They follow the success measures named for the advocacy
 * work: packs delivered, citations of published tables, and re-identification incidents.
 */
export const INDICATORS: readonly IndicatorDefinition[] = [
  indicator("input_sets", "input", "input_sets_in_latest_pack"),
  ...REPORT_KINDS.map((kind) => indicator(`reports_${kind}`, "input", "reports_in_published_tables", kind)),
  indicator("tables_published", "output", "tables_published_in_latest_pack"),
  indicator("packs_delivered", "output", "packs_delivered"),
  indicator("citations_logged", "outcome", "citations_logged"),
  indicator("incidents_found", "outcome", "incidents_found_in_reviews"),
];

function inYear(date: string, year: number | undefined): boolean {
  if (!isRealDate(date)) return false;
  return year === undefined || date.startsWith(`${String(year).padStart(4, "0")}-`);
}

/** The pack with the latest as-of date. Ties go to the higher fingerprint, so the choice is stable. */
function latestPack(packs: readonly ReportEvidencePack[]): ReportEvidencePack | undefined {
  return [...packs].sort((a, b) => (a.as_of === b.as_of ? (a.fingerprint < b.fingerprint ? 1 : -1) : a.as_of < b.as_of ? 1 : -1))[0];
}

type Outcome = { value: number; used: number; example: boolean } | null;

function measure(definition: IndicatorDefinition, records: KpiRecords, options: KpiOptions): Outcome {
  const campaign = definition.campaign;
  const pack = latestPack(records.packs);
  switch (definition.measure) {
    case "input_sets_in_latest_pack":
      return pack ? { value: pack.provenance.length, used: 1, example: pack.demonstration } : null;
    case "reports_in_published_tables": {
      if (!pack) return null;
      const tables = pack.tables.filter((table) => table.state === "published" && (!campaign || table.kind === campaign));
      if (tables.length === 0) return null;
      return { value: tables.reduce((sum, table) => sum + (table.state === "published" ? table.total : 0), 0), used: 1, example: pack.demonstration };
    }
    case "tables_published_in_latest_pack": {
      if (!pack) return null;
      const tables = pack.tables.filter((table) => !campaign || table.kind === campaign);
      if (tables.length === 0) return null;
      return { value: tables.filter((table) => table.state === "published").length, used: 1, example: pack.demonstration };
    }
    case "packs_delivered": {
      const list = records.deliveries.filter((d) => inYear(d.delivered_on, options.year) && (!campaign || d.campaign === campaign));
      return list.length === 0 ? null : { value: list.length, used: list.length, example: list.some((d) => d.example) };
    }
    case "citations_logged": {
      const list = records.citations.filter((c) => inYear(c.cited_on, options.year) && (!campaign || c.campaign === campaign));
      return list.length === 0 ? null : { value: list.length, used: list.length, example: list.some((c) => c.example) };
    }
    case "incidents_found_in_reviews": {
      const list = records.reviews.filter(
        (r) => inYear(r.reviewed_on, options.year) && Number.isInteger(r.incidents_found) && r.incidents_found >= 0,
      );
      return list.length === 0
        ? null
        : { value: list.reduce((sum, r) => sum + r.incidents_found, 0), used: list.length, example: list.some((r) => r.example) };
    }
  }
}

/** Compute every indicator, in the order given. Invalid definitions throw; they are a programming error. */
export function computeIndicators(
  definitions: readonly IndicatorDefinition[],
  records: KpiRecords,
  options: KpiOptions = {},
): KpiResult[] {
  return definitions.map((definition): KpiResult => {
    const check = validateIndicator(definition);
    if (!check.ok) throw new Error(`indicator definition is not valid: ${JSON.stringify(check.issues)}`);
    const base = { id: definition.id, stage: definition.stage, measure: definition.measure, campaign: definition.campaign ?? null };
    const outcome = measure(definition, records, options);
    if (!outcome) return { ...base, state: "no_data" };
    return { ...base, state: "value", value: outcome.value, records_used: outcome.used, from_example_records: outcome.example };
  });
}

/** Results grouped by stage of the logic model, in the order input, output, outcome. */
export function logicModel(results: readonly KpiResult[]): Array<{ stage: KpiStage; indicators: KpiResult[] }> {
  return KPI_STAGES.map((stage) => ({ stage, indicators: results.filter((result) => result.stage === stage) }));
}
