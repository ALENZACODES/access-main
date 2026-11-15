/**
 * JSON Schema 2020-12 documents. Every object is closed (additionalProperties: false),
 * so a personal field cannot ride along. Unknown is the string "UNKNOWN".
 */
import {
  CATEGORIES,
  CELL_SCHEMA_VERSION,
  COMMUNITY_BANDS,
  GEOGRAPHY_LEVELS,
  HEADLINE_EXCLUSIONS,
  OBSERVATION_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  PROTOTYPE_LABELS,
} from "./types.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const DAY = "(0[1-9]|[12][0-9]|3[01])";
const MONTH = "(0[1-9]|1[0-2])";

export const OBSERVATION_SCHEMA_ID = "urn:access-main:advocacy:observation:1.0.0";
export const CELL_SCHEMA_ID = "urn:access-main:advocacy:cell:1.0.0";
export const PACK_SCHEMA_ID = "urn:access-main:advocacy:pack:1.0.0";

const sharedDefs = {
  category: { enum: [...CATEGORIES] },
  areaId: { type: "string", pattern: "^(UNKNOWN|[a-z0-9][a-z0-9-]{1,39})$" },
  period: { type: "string", pattern: `^(UNKNOWN|[0-9]{4}-${MONTH})$` },
  isoDate: { type: "string", pattern: `^[0-9]{4}-${MONTH}-${DAY}$` },
  dateOrUnknown: { type: "string", pattern: `^(UNKNOWN|[0-9]{4}-${MONTH}-${DAY})$` },
  token: { type: "string", pattern: "^[a-z0-9][a-z0-9_.-]{1,63}$" },
  tier: { enum: [0, 1, "E"] },
  label: { enum: [...PROTOTYPE_LABELS] },
  text: { type: "string", minLength: 1, maxLength: 600 },
  localised: {
    type: "object",
    additionalProperties: false,
    required: ["en", "fr"],
    properties: { en: { $ref: "#/$defs/text" }, fr: { $ref: "#/$defs/text" } },
  },
  nonNegativeInt: { type: "integer", minimum: 0 },
};

const geographyCore = {
  level: { enum: [...GEOGRAPHY_LEVELS] },
  id: { $ref: "#/$defs/areaId" },
};

/** An unknown level must carry the UNKNOWN id; a region must carry a real id. */
const geographyRules = {
  if: { type: "object", properties: { level: { const: "unknown" } }, required: ["level"] },
  then: { properties: { id: { const: "UNKNOWN" } } },
  else: { properties: { id: { not: { const: "UNKNOWN" } } } },
};

export const observationSchema = {
  $schema: DRAFT,
  $id: OBSERVATION_SCHEMA_ID,
  title: "Advocacy input observation",
  type: "object",
  additionalProperties: false,
  required: [
    "record_type",
    "schema_version",
    "id",
    "example",
    "category",
    "geography",
    "period",
    "count",
    "source_id",
    "source_name",
    "source_url",
    "licence",
    "source_date",
    "tier",
    "prototype_label",
  ],
  properties: {
    record_type: { const: "advocacy_observation" },
    schema_version: { const: OBSERVATION_SCHEMA_VERSION },
    id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{2,63}$" },
    example: { type: "boolean" },
    category: { $ref: "#/$defs/category" },
    geography: {
      type: "object",
      additionalProperties: false,
      required: ["level", "id", "community_size_band"],
      properties: { ...geographyCore, community_size_band: { enum: [...COMMUNITY_BANDS] } },
      ...geographyRules,
    },
    period: { $ref: "#/$defs/period" },
    count: {
      oneOf: [{ type: "integer", minimum: 0, maximum: 10000000 }, { const: "UNKNOWN" }],
    },
    source_id: { $ref: "#/$defs/token" },
    source_name: { type: "string", minLength: 1, maxLength: 120 },
    source_url: { oneOf: [{ type: "null" }, { type: "string", pattern: "^https://[^\\s]+$", maxLength: 300 }] },
    licence: { type: "string", minLength: 1, maxLength: 80 },
    source_date: { $ref: "#/$defs/dateOrUnknown" },
    tier: { $ref: "#/$defs/tier" },
    prototype_label: { oneOf: [{ type: "null" }, { $ref: "#/$defs/label" }] },
  },
  allOf: [
    {
      if: { type: "object", properties: { prototype_label: { const: "SEEDED-OPEN-DATA" } }, required: ["prototype_label"] },
      then: { properties: { tier: { const: 0 } } },
    },
    {
      if: { type: "object", properties: { prototype_label: { const: "PROTOTYPE-UNVERIFIED" } }, required: ["prototype_label"] },
      then: { properties: { tier: { enum: [0, 1] } } },
    },
    {
      if: { type: "object", properties: { tier: { const: "E" } }, required: ["tier"] },
      then: { properties: { prototype_label: { type: "null" } } },
    },
  ],
  $defs: sharedDefs,
} as const;

const provenance = {
  type: "object",
  additionalProperties: false,
  required: ["source_ids", "licences", "tiers", "prototype_labels", "latest_source_date"],
  properties: {
    source_ids: { type: "array", items: { $ref: "#/$defs/token" }, minItems: 1, uniqueItems: true },
    licences: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, uniqueItems: true },
    tiers: { type: "array", items: { $ref: "#/$defs/tier" }, minItems: 1, uniqueItems: true },
    prototype_labels: { type: "array", items: { $ref: "#/$defs/label" }, uniqueItems: true },
    latest_source_date: { $ref: "#/$defs/dateOrUnknown" },
  },
} as const;

/**
 * A published cell may never hold a count below 3. A suppressed cell has exactly the six
 * identifying keys and nothing else, so no count, reason, or source can leak through it.
 */
export const cellSchema = {
  $schema: DRAFT,
  $id: CELL_SCHEMA_ID,
  title: "Advocacy aggregate cell",
  type: "object",
  additionalProperties: false,
  required: ["record_type", "schema_version", "category", "geography", "period", "state"],
  properties: {
    record_type: { const: "advocacy_cell" },
    schema_version: { const: CELL_SCHEMA_VERSION },
    category: { $ref: "#/$defs/category" },
    geography: {
      type: "object",
      additionalProperties: false,
      required: ["level", "id"],
      properties: geographyCore,
      ...geographyRules,
    },
    period: { $ref: "#/$defs/period" },
    state: { enum: ["published", "suppressed", "unknown"] },
    count: { type: "integer", minimum: 3 },
    example: { type: "boolean" },
    headline_eligible: { type: "boolean" },
    headline_exclusions: { type: "array", items: { enum: [...HEADLINE_EXCLUSIONS] }, uniqueItems: true },
    provenance,
  },
  allOf: [
    {
      if: { type: "object", properties: { state: { const: "published" } }, required: ["state"] },
      then: { required: ["count", "example", "headline_eligible", "headline_exclusions", "provenance"] },
    },
    {
      if: { type: "object", properties: { state: { const: "unknown" } }, required: ["state"] },
      then: {
        required: ["example", "provenance"],
        not: { anyOf: [{ required: ["count"] }, { required: ["headline_eligible"] }, { required: ["headline_exclusions"] }] },
      },
    },
    {
      if: { type: "object", properties: { state: { const: "suppressed" } }, required: ["state"] },
      then: { maxProperties: 6 },
    },
  ],
  $defs: sharedDefs,
} as const;

const strings = { type: "array", items: { $ref: "#/$defs/text" }, minItems: 1 };

export const packSchema = {
  $schema: DRAFT,
  $id: PACK_SCHEMA_ID,
  title: "Advocacy campaign evidence pack",
  type: "object",
  additionalProperties: false,
  required: [
    "record_type",
    "schema_version",
    "publication_context",
    "as_of",
    "demonstration",
    "methodology",
    "suppression",
    "counting",
    "headline",
    "inputs",
    "counts",
    "cells",
  ],
  properties: {
    record_type: { const: "advocacy_evidence_pack" },
    schema_version: { const: PACK_SCHEMA_VERSION },
    publication_context: { const: "prototype" },
    as_of: { $ref: "#/$defs/isoDate" },
    demonstration: { type: "boolean" },
    methodology: {
      type: "object",
      additionalProperties: false,
      required: ["en", "fr"],
      properties: { en: strings, fr: strings },
    },
    suppression: {
      type: "object",
      additionalProperties: false,
      required: ["k", "small_community_factor", "small_community_minimum", "raw_counts_withheld", "totals_published", "rules"],
      properties: {
        k: { type: "integer", minimum: 3 },
        small_community_factor: { type: "integer", minimum: 1 },
        small_community_minimum: { type: "integer", minimum: 3 },
        raw_counts_withheld: { const: true },
        totals_published: { const: false },
        rules: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "en", "fr"],
            properties: { id: { $ref: "#/$defs/token" }, en: { $ref: "#/$defs/text" }, fr: { $ref: "#/$defs/text" } },
          },
        },
      },
    },
    counting: {
      type: "object",
      additionalProperties: false,
      required: ["reference", "headline_max_age_days", "status_window_days", "note"],
      properties: {
        reference: { const: "packages/schema/docs/counting-rules.md" },
        headline_max_age_days: { const: 730 },
        status_window_days: { const: 30 },
        note: { $ref: "#/$defs/localised" },
      },
    },
    headline: {
      type: "object",
      additionalProperties: false,
      required: ["eligible_cells", "province_wide_total"],
      properties: { eligible_cells: { $ref: "#/$defs/nonNegativeInt" }, province_wide_total: { type: "null" } },
    },
    inputs: {
      type: "object",
      additionalProperties: false,
      required: ["observations_received", "observations_accepted", "observations_rejected", "example_observations"],
      properties: {
        observations_received: { $ref: "#/$defs/nonNegativeInt" },
        observations_accepted: { $ref: "#/$defs/nonNegativeInt" },
        observations_rejected: { $ref: "#/$defs/nonNegativeInt" },
        example_observations: { $ref: "#/$defs/nonNegativeInt" },
      },
    },
    counts: {
      type: "object",
      additionalProperties: false,
      required: ["published", "suppressed", "unknown"],
      properties: {
        published: { $ref: "#/$defs/nonNegativeInt" },
        suppressed: { $ref: "#/$defs/nonNegativeInt" },
        unknown: { $ref: "#/$defs/nonNegativeInt" },
      },
    },
    cells: { type: "array", items: { $ref: CELL_SCHEMA_ID } },
  },
  $defs: sharedDefs,
} as const;
