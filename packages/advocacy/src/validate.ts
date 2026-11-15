import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { isRealDate } from "./dates.ts";
import {
  CELL_SCHEMA_ID,
  OBSERVATION_SCHEMA_ID,
  PACK_SCHEMA_ID,
  cellSchema,
  observationSchema,
  packSchema,
} from "./schemas.ts";
import type { Cell, EvidencePack, Observation } from "./types.ts";

export interface ValidationIssue {
  field: string;
  code: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
ajv.addSchema(observationSchema);
ajv.addSchema(cellSchema);
ajv.addSchema(packSchema);

function compiled(id: string): ValidateFunction {
  const fn = ajv.getSchema(id);
  if (!fn) throw new Error(`schema not registered: ${id}`);
  return fn;
}

const validateObservationSchema = compiled(OBSERVATION_SCHEMA_ID);
const validateCellSchema = compiled(CELL_SCHEMA_ID);
const validatePackSchema = compiled(PACK_SCHEMA_ID);

/** Keys that would identify a person or a place precisely, or hold health or account data. */
const PII_KEY =
  /^(name|fullname|firstname|lastname|email|emailaddress|phone|phonenumber|address|streetaddress|postalcode|postcode|zip|latitude|lat|longitude|lng|lon|coordinates|userid|deviceid|ipaddress|dateofbirth|dob|healthcard|ohip|diagnosis|injurylevel|medication|medications|password|token|apikey|secret)$/;
const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/** Paths of keys, and of string values shaped like an email, that must not appear in any record. */
export function findPersonalData(value: unknown, path = ""): ValidationIssue[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findPersonalData(item, `${path}[${index}]`));
  if (typeof value === "string") return EMAIL_VALUE.test(value) ? [{ field: path, code: "contact_like_value" }] : [];
  if (value === null || typeof value !== "object") return [];
  const issues: ValidationIssue[] = [];
  for (const [key, child] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (PII_KEY.test(normaliseKey(key))) issues.push({ field: here, code: "personal_field" });
    issues.push(...findPersonalData(child, here));
  }
  return issues;
}

function fromAjv(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({ field: error.instancePath || "(root)", code: error.keyword }));
}

function run<T>(fn: ValidateFunction, value: unknown, extra: ValidationIssue[] = []): ValidationResult<T> {
  const issues = [...findPersonalData(value), ...extra];
  if (!fn(value)) issues.push(...fromAjv(fn.errors));
  return issues.length === 0 ? { ok: true, value: value as T } : { ok: false, issues };
}

export function validateObservation(value: unknown): ValidationResult<Observation> {
  const extra: ValidationIssue[] = [];
  const date = (value as { source_date?: unknown } | null)?.source_date;
  if (typeof date === "string" && date !== "UNKNOWN" && !isRealDate(date)) {
    extra.push({ field: "/source_date", code: "invalid_date" });
  }
  return run<Observation>(validateObservationSchema, value, extra);
}

export function validateCell(value: unknown): ValidationResult<Cell> {
  return run<Cell>(validateCellSchema, value);
}

export function validatePack(value: unknown): ValidationResult<EvidencePack> {
  return run<EvidencePack>(validatePackSchema, value);
}
