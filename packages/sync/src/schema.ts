import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ValidateFunction } from "ajv";
import { CACHE_KINDS } from "@access/shared";
import type { Conflict, ReconcileReport, Snapshot } from "./types.ts";

// Every schema is draft 2020-12 and closed at its defined boundaries.
const uri = { anyOf: [{ type: "string", format: "uri" }, { type: "null" }] };
const provenance = {
  type: "object", additionalProperties: false,
  required: ["source_name", "source_url", "licence", "licence_url", "source_date", "retrieved_at", "tier", "prototype_label", "freshness"],
  properties: {
    source_name: { type: "string", minLength: 1 }, source_url: uri,
    licence: { type: "string", minLength: 1 }, licence_url: uri,
    source_date: { type: "string", format: "date" },
    retrieved_at: { type: "string", format: "date-time" },
    tier: { enum: [0, 1, "E"] },
    prototype_label: { enum: [null, "PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA"] },
    freshness: { enum: ["unknown", "current", "stale"] },
  },
} as const;
const sourcedValue = {
  type: "object", additionalProperties: false, required: ["value", "provenance"],
  properties: { value: {}, provenance },
} as const;
const cacheEntry = {
  type: "object", additionalProperties: false,
  required: ["id", "kind", "title", "stored_at", "provenance", "contains_live_status", "payload"],
  properties: {
    id: { type: "string", minLength: 1 }, kind: { enum: [...CACHE_KINDS] },
    title: { type: "string", minLength: 1 }, stored_at: { type: "string", format: "date-time" },
    provenance, contains_live_status: { const: false },
    payload: { type: "object" },
    field_provenance: { type: "object", additionalProperties: provenance },
  },
} as const;
const outbox = {
  type: "object", additionalProperties: false,
  required: ["id", "created_at", "kind", "based_on_record_id", "note", "status"],
  properties: {
    id: { type: "string", minLength: 1 }, created_at: { type: "string", format: "date-time" },
    kind: { const: "correction-report" },
    based_on_record_id: { type: ["string", "null"] },
    note: { type: "string", minLength: 1, maxLength: 500 },
    status: { const: "queued-on-device" },
  },
} as const;
const snapshotCore = {
  type: "object", additionalProperties: false,
  required: ["label", "as_of", "records", "outbox"],
  properties: {
    label: { type: "string", minLength: 1 }, as_of: { type: "string", format: "date-time" },
    records: { type: "array", items: cacheEntry }, outbox: { type: "array", items: outbox },
  },
} as const;
const conflictCore = {
  type: "object", additionalProperties: false,
  required: ["record_id", "field", "left", "right"],
  properties: {
    record_id: { type: "string", minLength: 1 }, field: { type: "string", minLength: 1 },
    left: sourcedValue, right: sourcedValue,
  },
} as const;
const schema = (body: object) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", ...body });
export const snapshotSchema = schema(snapshotCore);
export const conflictSchema = schema(conflictCore);
export const reportSchema = schema({
  type: "object", additionalProperties: false,
  required: ["left_label", "right_label", "merged", "conflicts", "unknown_observations", "metadata_lww"],
  properties: {
    left_label: { type: "string", minLength: 1 }, right_label: { type: "string", minLength: 1 },
    merged: snapshotCore,
    conflicts: { type: "array", items: conflictCore },
    unknown_observations: {
      type: "array", items: {
        type: "object", additionalProperties: false, required: ["record_id", "field", "side"],
        properties: { record_id: { type: "string" }, field: { type: "string" }, side: { enum: ["left", "right"] } },
      },
    },
    metadata_lww: {
      type: "array", items: {
        type: "object", additionalProperties: false, required: ["record_id", "field", "chosen"],
        properties: { record_id: { type: "string" }, field: { const: "stored_at" }, chosen: { enum: ["left", "right"] } },
      },
    },
  },
});

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const snapshotValidator: ValidateFunction<Snapshot> = ajv.compile(snapshotSchema);
const conflictValidator: ValidateFunction<Conflict> = ajv.compile(conflictSchema);
const reportValidator: ValidateFunction<ReconcileReport> = ajv.compile(reportSchema);

function assertValid<T>(value: unknown, validator: ValidateFunction<T>, label: string): asserts value is T {
  if (!validator(value)) {
    throw new Error(`${label}: ${ajv.errorsText(validator.errors)}`);
  }
}
export function assertSnapshot(value: unknown): asserts value is Snapshot {
  assertValid(value, snapshotValidator, "Invalid snapshot");
}
export function assertConflict(value: unknown): asserts value is Conflict {
  assertValid(value, conflictValidator, "Invalid conflict");
}
export function assertReport(value: unknown): asserts value is ReconcileReport {
  assertValid(value, reportValidator, "Invalid report");
}
