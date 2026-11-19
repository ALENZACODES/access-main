/**
 * JSON Schema 2020-12 documents for report inputs. Every object is closed, so a personal field,
 * a free-text note, a day or a position cannot ride along with a report.
 */
import {
  CONSENT_ENTRY_SCHEMA_VERSION,
  CONSENT_STATUSES,
  INPUT_SET_SCHEMA_VERSION,
  POPULATION_BANDS,
  REGION_SCHEMA_VERSION,
  REPORT_KINDS,
  REPORT_SCHEMA_VERSION,
  SET_LABELS,
  SET_TIERS,
  TOPICS,
} from "./types.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const MONTH = "(0[1-9]|1[0-2])";
const DAY = "(0[1-9]|[12][0-9]|3[01])";
const TOKEN = "^[a-z0-9][a-z0-9_.-]{1,63}$";
const REGION_CODE = "^[a-z0-9][a-z0-9-]{1,39}$";

export const REPORT_SCHEMA_ID = "urn:access-main:advocacy:report:1.0.0";
export const INPUT_SET_SCHEMA_ID = "urn:access-main:advocacy:input-set:1.0.0";
export const REGION_SCHEMA_ID = "urn:access-main:advocacy:region:1.0.0";
export const CONSENT_ENTRY_SCHEMA_ID = "urn:access-main:advocacy:consent-entry:1.0.0";

const topicRule = (kind: (typeof REPORT_KINDS)[number]) => ({
  if: { type: "object", properties: { kind: { const: kind } }, required: ["kind"] },
  then: { properties: { topic: { enum: [...TOPICS[kind]] } } },
});

export const reportSchema = {
  $schema: DRAFT,
  $id: REPORT_SCHEMA_ID,
  title: "Consented structured report",
  type: "object",
  additionalProperties: false,
  required: ["record_type", "schema_version", "id", "example", "kind", "topic", "region_code", "period", "set_id", "consent_ref"],
  properties: {
    record_type: { const: "advocacy_report" },
    schema_version: { const: REPORT_SCHEMA_VERSION },
    id: { type: "string", pattern: TOKEN },
    example: { type: "boolean" },
    kind: { enum: [...REPORT_KINDS] },
    topic: { type: "string" },
    region_code: { type: "string", pattern: `^(UNKNOWN|${REGION_CODE.slice(1, -1)})$` },
    period: { type: "string", pattern: `^(UNKNOWN|[0-9]{4}-${MONTH})$` },
    set_id: { type: "string", pattern: TOKEN },
    consent_ref: { type: "string", pattern: TOKEN },
  },
  allOf: REPORT_KINDS.map(topicRule),
} as const;

export const inputSetSchema = {
  $schema: DRAFT,
  $id: INPUT_SET_SCHEMA_ID,
  title: "Provenance of one set of reports",
  type: "object",
  additionalProperties: false,
  required: ["record_type", "schema_version", "id", "example", "source_name", "source_url", "licence", "source_date", "tier", "label"],
  properties: {
    record_type: { const: "advocacy_input_set" },
    schema_version: { const: INPUT_SET_SCHEMA_VERSION },
    id: { type: "string", pattern: TOKEN },
    example: { type: "boolean" },
    source_name: { type: "string", minLength: 1, maxLength: 120 },
    source_url: { oneOf: [{ type: "null" }, { type: "string", pattern: "^https://[^\\s]+$", maxLength: 300 }] },
    licence: { type: "string", minLength: 1, maxLength: 80 },
    source_date: { type: "string", pattern: `^(UNKNOWN|[0-9]{4}-${MONTH}-${DAY})$` },
    tier: { enum: [...SET_TIERS] },
    label: { oneOf: [{ type: "null" }, { enum: [...SET_LABELS] }] },
  },
  allOf: [
    {
      if: { type: "object", properties: { label: { const: "SEEDED-OPEN-DATA" } }, required: ["label"] },
      then: { properties: { tier: { const: 0 } } },
    },
    {
      if: { type: "object", properties: { label: { const: "PROTOTYPE-UNVERIFIED" } }, required: ["label"] },
      then: { properties: { tier: { enum: [0, 1] } } },
    },
    {
      if: { type: "object", properties: { label: { const: "COMMUNITY-REPORTED" } }, required: ["label"] },
      then: { properties: { tier: { const: 2 } } },
    },
  ],
} as const;

export const regionSchema = {
  $schema: DRAFT,
  $id: REGION_SCHEMA_ID,
  title: "Region in the roll-up table",
  type: "object",
  additionalProperties: false,
  required: ["record_type", "schema_version", "code", "parent", "population_band", "example"],
  properties: {
    record_type: { const: "advocacy_region" },
    schema_version: { const: REGION_SCHEMA_VERSION },
    code: { type: "string", pattern: REGION_CODE },
    parent: { oneOf: [{ type: "null" }, { type: "string", pattern: REGION_CODE }] },
    population_band: { enum: [...POPULATION_BANDS] },
    example: { type: "boolean" },
  },
} as const;

export const consentEntrySchema = {
  $schema: DRAFT,
  $id: CONSENT_ENTRY_SCHEMA_ID,
  title: "Consent ledger entry",
  type: "object",
  additionalProperties: false,
  required: ["record_type", "schema_version", "ref", "purpose_id", "purpose_version", "status"],
  properties: {
    record_type: { const: "advocacy_consent_entry" },
    schema_version: { const: CONSENT_ENTRY_SCHEMA_VERSION },
    ref: { type: "string", pattern: TOKEN },
    purpose_id: { type: "string", pattern: TOKEN },
    purpose_version: { type: "integer", minimum: 1 },
    status: { enum: [...CONSENT_STATUSES] },
  },
} as const;
