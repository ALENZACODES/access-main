import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { isRealDate } from "../dates.ts";
import { findPersonalData, type ValidationIssue, type ValidationResult } from "../validate.ts";
import { looksLikePrecisePlace } from "./coarsen.ts";
import { consentEntrySchema, inputSetSchema, regionSchema, reportSchema } from "./schemas.ts";
import { UNKNOWN, type AdvocacyReport, type ConsentEntry, type InputSet, type Region } from "./types.ts";

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const reportFn = ajv.compile(reportSchema);
const inputSetFn = ajv.compile(inputSetSchema);
const regionFn = ajv.compile(regionSchema);
const consentEntryFn = ajv.compile(consentEntrySchema);

function run<T>(fn: ValidateFunction, value: unknown, extra: ValidationIssue[] = []): ValidationResult<T> {
  const issues = [...findPersonalData(value), ...extra];
  if (!fn(value)) {
    for (const error of fn.errors ?? []) issues.push({ field: error.instancePath || "(root)", code: error.keyword });
  }
  return issues.length === 0 ? { ok: true, value: value as T } : { ok: false, issues };
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function preciseIssue(value: unknown, key: string): ValidationIssue[] {
  const code = field(value, key);
  return typeof code === "string" && looksLikePrecisePlace(code) ? [{ field: `/${key}`, code: "place_too_precise" }] : [];
}

export function validateReport(value: unknown): ValidationResult<AdvocacyReport> {
  return run<AdvocacyReport>(reportFn, value, preciseIssue(value, "region_code"));
}

export function validateInputSet(value: unknown): ValidationResult<InputSet> {
  const date = field(value, "source_date");
  const extra: ValidationIssue[] =
    typeof date === "string" && date !== UNKNOWN && !isRealDate(date) ? [{ field: "/source_date", code: "invalid_date" }] : [];
  return run<InputSet>(inputSetFn, value, extra);
}

export function validateRegion(value: unknown): ValidationResult<Region> {
  return run<Region>(regionFn, value, [...preciseIssue(value, "code"), ...preciseIssue(value, "parent")]);
}

export function validateConsentEntry(value: unknown): ValidationResult<ConsentEntry> {
  return run<ConsentEntry>(consentEntryFn, value);
}
